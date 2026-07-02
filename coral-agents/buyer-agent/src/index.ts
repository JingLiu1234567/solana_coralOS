/**
 * Buyer agent — the marketplace buyer. Broadcasts a WANT into a shared CoralOS thread, collects
 * competing LLM bids, picks the best value, and settles through the escrow contract:
 *
 *   WANT → (collect BIDs for a window) → AWARD winner → wait ESCROW_REQUIRED →
 *   deposit() into escrow → DEPOSITED → wait DELIVERED → release() to the seller
 *
 * Selection uses the LLM (best value), with a deterministic cheapest fallback so a slow/missing model
 * never hangs the round. Settlement is escrow-only — funds are conditional on delivery.
 *
 * Env: BUYER_KEYPAIR_B58 (signs), BUYER_MAX_SOL (budget), BUYER_SERVICE/BUYER_ARG (the WANT),
 *      MARKET_SELLERS (csv of seller names), BID_WINDOW_MS, SOLANA_RPC_URL,
 *      ANTHROPIC_API_KEY|OPENAI_API_KEY (+ LLM_PROVIDER), TRACE=1.
 *
 * The deposit/release calls settle against the escrow program deployed to devnet; they need a funded
 * devnet wallet + live RPC, so they run in a live market session rather than in `npm test`/CI.
 */
import { createHash } from 'node:crypto'
import {
  startCoralAgent, complete, parseJsonReply, loadKeypairB58,
  formatWant, parseBid, parseProposal, parseEscrowRequired, formatAward, formatDeposited,
  selectBids, pickCheapest, verb, messageRound,
  type Bid, type EscrowTerms, type CoralAgentContext, type ProposalContent,
} from '@pay/agent-runtime'
import { PublicKey } from '@solana/web3.js'
import { makeProgram, deposit, release, releaseWithMemo, escrowPda } from './escrow.js'
import { payoutMatches } from './guard.js'

/**
 * Build the SPL Memo payload written to Solana on deposit.
 * Includes the tender ref, AC list, and a SHA-256 of the full brief so the on-chain record
 * is cryptographically bound to the exact acceptance criteria shown to sellers.
 */
function buildChainMemo(brief: string, topic: string, amountSol: number): string {
  const ref  = brief.split(' | ').find((s) => s.startsWith('Ref:'))?.replace('Ref:', '').trim() ?? 'TenderNet'
  const acs  = brief.split(' | ').filter((s) => /^AC\d+:/.test(s)).map((s) => s.split(':')[0]).join(',')
  const hash = createHash('sha256').update(brief).digest('hex')
  return `TenderNet | Ref: ${ref} | Topic: ${topic.slice(0, 55)} | Criteria: ${acs} | Budget: ${amountSol} SOL | sha256: ${hash}`
}

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const BUDGET = Number(process.env.BUYER_MAX_SOL ?? '0.001')
const SERVICE = process.env.BUYER_SERVICE ?? 'coingecko' // canonical default (matches coral-agent.toml + start.ts)
// Rotate through several args so each round trades a *different* thing (BUYER_ARGS=csv of fixture ids,
// else the single BUYER_ARG). This is what stops the market looking like the same round on a loop.
const ARGS = (process.env.BUYER_ARGS || process.env.BUYER_ARG || 'SOL-USDC').split(',').map((s) => s.trim()).filter(Boolean)
const ARG = ARGS[0]
const BID_WINDOW_MS = Number(process.env.BID_WINDOW_MS ?? '5000')
const CYCLE_MS = Number(process.env.CYCLE_INTERVAL_MS ?? '30000')
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS ?? '0') // 0 = unlimited
const SELLERS = (process.env.MARKET_SELLERS ?? 'seller-cheap,seller-premium')
  .split(',').map((s) => s.trim()).filter(Boolean)
// F3: the payout wallet the buyer expects (personas share one in the demo). If set, the buyer refuses
// to deposit to an ESCROW_REQUIRED whose seller= pubkey differs — binding the award to the payout.
const EXPECTED_SELLER_WALLET = process.env.SELLER_WALLET ?? ''
const trace = process.env.TRACE === '1'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const expl = (kind: 'tx' | 'address', id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`

/**
 * LLM verification of the delivered report against the tender's AC criteria.
 * Returns a score (0-100), per-AC pass/fail, and whether the threshold is met.
 * Minimum passing score is 60 — below that, funds stay locked in escrow.
 */
async function scoreDelivery(
  deliveredRaw: string,
  brief: string,
): Promise<{ score: number; acChecks: string; passed: boolean; summary: string }> {
  const acCriteria = brief.split(' | ').filter((s) => /^AC\d+:/.test(s))
  try {
    const system =
      'You are a UK government procurement officer verifying a delivered research report against acceptance criteria. ' +
      'Score the delivery 0-100. For each AC, decide if it is addressed (true) or missing (false). ' +
      'Reply ONLY with JSON: {"score": 0-100, "ac_checks": {"AC1": true/false, "AC2": true/false, "AC3": true/false, "AC4": true/false, "AC5": true/false}, "summary": "one sentence verdict"}'
    const user =
      `Acceptance criteria to verify:\n${acCriteria.join('\n')}\n\nDelivered report (excerpt):\n${deliveredRaw.slice(0, 1200)}`
    const parsed = parseJsonReply<{ score: number; ac_checks: Record<string, boolean>; summary: string }>(
      await complete({ system, user, maxTokens: 200 }),
    )
    if (!parsed) return { score: 0, acChecks: 'parse-failed', passed: false, summary: 'scoring unavailable' }
    const acStr = Object.entries(parsed.ac_checks ?? {}).map(([k, v]) => `${k}${v ? '✓' : '✗'}`).join(' ')
    return { score: parsed.score, acChecks: acStr, passed: parsed.score >= 60, summary: parsed.summary ?? '' }
  } catch {
    return { score: 0, acChecks: 'eval-failed', passed: false, summary: 'scoring error' }
  }
}

/**
 * Build the SPL Memo for the release transaction — the permanent on-chain settlement record.
 * Includes: winner, delivery score, per-AC verdict, all proposal hashes, report hash.
 * Anyone can verify by re-hashing the original content and comparing.
 */
function buildReleaseMemo(
  ref: string,
  winner: string,
  score: number,
  acChecks: string,
  proposalHashes: Record<string, string>,
  reportHash: string,
): string {
  const proposals = Object.entries(proposalHashes).map(([name, h]) => `${name}:${h}`).join(',')
  return `TenderNet|${ref}|winner:${winner}|score:${score}/100|${acChecks}|proposals:${proposals}|report:${reportHash}`
}

/** Generate a detailed UK government ITT-style tender brief from a research topic. Single line, pipe-separated, no double quotes. */
async function generateBrief(topic: string): Promise<string> {
  try {
    const system =
      'You are a UK government procurement officer drafting an Invitation to Tender (ITT). ' +
      'Write a detailed tender specification as a SINGLE LINE (no newlines) using " | " as section separator. No double quotes anywhere. Use single quotes if needed. ' +
      'Follow this exact structure: ' +
      'Contracting Authority: [specific UK dept] | Ref: [ref code] | CPV: [code + label] | ' +
      'Background: [2 sentences on policy context and why this research is needed now] | ' +
      'Scope: [specific research methods, sample size, geographic coverage, service areas to examine] | ' +
      'AC1: [acceptance criterion 1 — must be measurable and specific, at least 2 sentences, e.g. "Section X must present Y with Z evidence. Data must be disaggregated by [specific variable]."] | ' +
      'AC2: [acceptance criterion 2 — at least 2 sentences with specific measurable requirements] | ' +
      'AC3: [acceptance criterion 3 — at least 2 sentences with specific measurable requirements] | ' +
      'AC4: [acceptance criterion 4 — at least 2 sentences with specific measurable requirements] | ' +
      'AC5: [acceptance criterion 5 — policy recommendations: at least 2 sentences, must name min count of recommendations, name responsible body, and include implementation timeline] | ' +
      'Deliverables: [specific outputs with page/format requirements] | ' +
      'Social value: [specific commitment required from supplier] | ' +
      'Evaluation: quality of technical approach 40%, relevant experience and expertise 20%, social value 10%, price 30%'
    const raw = await complete({ system, user: `Research topic: ${topic}`, maxTokens: 900 })
    return raw.trim().replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 2500)
  } catch {
    return `Contracting Authority: Cabinet Office, Government Digital Service | Ref: GDS/2026/AI-001 | CPV: 73200000 Research and Development Services | Background: The UK Government Digital Service requires independent research to inform the AI Opportunities Action Plan. Current evidence on public attitudes towards AI in public services is fragmented and pre-dates recent deployments. | Scope: Mixed-methods study covering nationally representative survey (n>=500), focus groups across health, justice, education, and benefits services, and policy gap analysis. | AC1: Section 1 must present % of UK public supporting and opposing AI in each of 4 service areas, disaggregated by age, income, and digital literacy, citing primary survey data or peer-reviewed sources published within 24 months. | AC2: Section 2 must identify minimum 5 AI use cases in UK public services with quantified efficiency gains (% time saved or cost reduction) citing published government pilots or comparable international evidence. | AC3: Section 3 must assess adoption barriers across IT infrastructure, workforce capability, procurement frameworks, and regulation, with a readiness assessment for minimum 3 UK government departments. | AC4: Section 4 must address privacy, algorithmic bias, transparency, accountability, and job displacement, assessing each against UK GDPR, Equality Act 2010, and the AI White Paper 2023. | AC5: Section 5 must provide minimum 5 costed, actionable policy recommendations, each naming the responsible government body and a 12-month implementation milestone. | Deliverables: Full research report (minimum 5 sections per above), executive summary (max 2 pages), data appendix with methodology and sources. | Social value: Supplier must demonstrate inclusive research methods engaging underrepresented communities including low-income and low-digital-literacy groups. | Evaluation: quality of technical approach 40%, relevant experience and expertise 20%, social value 10%, price 30%`
  }
}

interface ProposalEntry { bid: Bid; proposal?: ProposalContent }

/** Evaluate proposals using weighted scoring: technical 40%, experience 20%, social 10%, price 30%.
 *  Technical score is blended 50/50 with ac_alignment — an AC response that answers the wrong criterion scores near 0. */
async function evaluateProposals(
  entries: ProposalEntry[],
  brief: string,
): Promise<{ winner: Bid; reason?: string }> {
  if (entries.length === 1) return { winner: entries[0].bid }

  // Price score: cheapest = 100, most expensive = 0 (normalised)
  const prices = entries.map((e) => e.bid.priceSol)
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const priceScore = (p: number) => maxP === minP ? 100 : 100 * (1 - (p - minP) / (maxP - minP))

  // Extract AC criteria so the evaluator can check alignment explicitly
  const acCriteria = brief.split(' | ').filter((s) => /^AC\d+:/.test(s))

  try {
    const system =
      'You are a UK government procurement evaluator. Score each proposal on FOUR criteria (0-100 each):\n' +
      '1. ac_alignment: Does each AC response actually address its specific acceptance criterion? ' +
      '100 = every response directly answers the criterion with relevant content. ' +
      '0 = responses ignore the criteria or answer a completely different question. ' +
      'Penalise heavily if AC2 asks about "trust drivers" but the response discusses "use case efficiency", etc.\n' +
      '2. technical: Overall rigour and quality of the proposed methodology.\n' +
      '3. experience: Credibility of team credentials and named past projects.\n' +
      '4. social: Specificity and credibility of social value commitments.\n\n' +
      'Reply ONLY with JSON: {"scores": [{"by": "name", "ac_alignment": 0-100, "technical": 0-100, "experience": 0-100, "social": 0-100}]}'

    const acBlock = acCriteria.length
      ? `Acceptance criteria (what each AC response MUST address):\n${acCriteria.map((ac) => `  ${ac}`).join('\n')}`
      : `Tender brief excerpt:\n${brief.slice(0, 400)}`

    const user =
      `${acBlock}\n\nProposals submitted:\n` +
      entries.map((e) => {
        const acResponses = e.proposal?.ac_responses
          ? Object.entries(e.proposal.ac_responses).map(([k, v]) => `    ${k}: ${v}`).join('\n')
          : '    (no AC responses provided)'
        return (
          `--- ${e.bid.by} (${e.bid.priceSol} SOL) ---\n` +
          `Methodology: ${e.proposal?.methodology ?? 'n/a'}\n` +
          `AC Responses:\n${acResponses}\n` +
          `Team: ${e.proposal?.team_credentials ?? 'n/a'}\n` +
          `Social value: ${e.proposal?.social_value ?? 'n/a'}`
        )
      }).join('\n\n')

    const parsed = parseJsonReply<{ scores: Array<{ by: string; ac_alignment: number; technical: number; experience: number; social: number }> }>(
      await complete({ system, user, maxTokens: 400 }),
    )

    let bestScore = -1, winner = entries[0].bid, reason = ''
    for (const e of entries) {
      const s = parsed?.scores.find((x) => x.by === e.bid.by)
      const acAlign = s?.ac_alignment ?? 50
      const t = s?.technical ?? 50, exp = s?.experience ?? 50, soc = s?.social ?? 50
      const ps = priceScore(e.bid.priceSol)
      // Technical weight (40%) split equally between methodology quality and AC alignment
      const blendedTech = 0.5 * t + 0.5 * acAlign
      const combined = 0.4 * blendedTech + 0.2 * exp + 0.1 * soc + 0.3 * ps
      if (combined > bestScore) {
        bestScore = combined; winner = e.bid
        reason = `Score ${Math.round(combined)}/100 — AC alignment: ${acAlign}, technical: ${Math.round(blendedTech)}, experience: ${exp}, social value: ${soc}, price: ${Math.round(ps)}`
      }
    }
    console.error(`[buyer] awarded to ${winner.by}: ${reason}`)
    return { winner, reason }
  } catch {
    const cheapest = pickCheapest(entries.map((e) => e.bid))!
    return { winner: cheapest, reason: 'cheapest available (scoring failed)' }
  }
}

/** Wait (bounded) for a message matching `round` that `parse` accepts. */
async function waitFor<T>(
  ctx: CoralAgentContext,
  round: number,
  parse: (text: string) => (T & { round: number }) | null,
  maxMs: number,
): Promise<T | null> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const m = await ctx.waitForMention(Math.max(500, deadline - Date.now()))
    if (!m) continue
    const parsed = parse(m.text)
    if (parsed && parsed.round === round) return parsed
  }
  return null
}

await startCoralAgent({ agentName: process.env.AGENT_NAME ?? 'buyer-agent' }, async (ctx) => {
  const buyer = loadKeypairB58('BUYER_KEYPAIR_B58')
  console.error(`[buyer] market buyer — wallet=${buyer.publicKey.toBase58()} budget=${BUDGET} sellers=[${SELLERS.join(',')}]`)

  await Promise.all(SELLERS.map((s) => ctx.waitForAgent(s, 8000).catch(() => {})))
  const thread = await ctx.createThread('market', SELLERS)
  const program = await makeProgram(buyer, RPC)
  let round = 0

  while (true) {
    try {
      round++
      const arg = ARGS[(round - 1) % ARGS.length] // rotate fixtures so consecutive rounds differ
      const brief = await generateBrief(arg)
      if (trace) console.error(`[buyer] round ${round}: WANT ${SERVICE} ${arg} budget=${BUDGET}`)
      await ctx.send(formatWant({ round, service: SERVICE, arg, brief, budgetSol: BUDGET }), thread, SELLERS)

      // ── collect proposals + bids during the window ───────────────────────
      const bids: Bid[] = []
      const proposals = new Map<string, ProposalContent>()
      const deadline = Date.now() + BID_WINDOW_MS
      while (Date.now() < deadline) {
        const m = await ctx.waitForMention(Math.max(500, deadline - Date.now()))
        if (!m) continue
        const p = parseProposal(m.text)
        if (p && p.round === round) { proposals.set(p.by, p.content); continue }
        const b = parseBid(m.text)
        if (b && b.round === round) bids.push(b)
      }
      const pool = selectBids(bids, round)
      if (pool.length === 0) {
        console.error(`[buyer] round ${round}: NO_SELLERS`)
        await sleep(CYCLE_MS)
        if (MAX_ROUNDS > 0 && round >= MAX_ROUNDS) break
        continue
      }
      const entries: ProposalEntry[] = pool.map((bid) => ({ bid, proposal: proposals.get(bid.by) }))

      // Hash every proposal now so they can be committed to chain in the release memo.
      const proposalHashes: Record<string, string> = {}
      for (const e of entries) {
        const content = e.proposal ? JSON.stringify(e.proposal) : e.bid.note ?? ''
        proposalHashes[e.bid.by] = createHash('sha256').update(content).digest('hex').slice(0, 12)
      }

      // ── award by weighted scoring: technical 40%, experience 20%, social 10%, price 30% ──
      const { winner, reason } = await evaluateProposals(entries, brief)
      await ctx.send(formatAward(round, winner.by, reason), thread, [winner.by])

      // ── settle through escrow: deposit → DEPOSITED → wait DELIVERED → release
      const terms = await waitFor<EscrowTerms>(ctx, round, parseEscrowRequired, 15_000)
      if (!terms) { console.error(`[buyer] round ${round}: no escrow terms from ${winner.by}`); await sleep(CYCLE_MS); continue }
      if (!payoutMatches(terms.seller, EXPECTED_SELLER_WALLET)) {
        console.error(`[buyer] round ${round}: escrow payout ${terms.seller} ≠ expected ${EXPECTED_SELLER_WALLET} — skipping`)
        await sleep(CYCLE_MS); continue
      }

      const reference = new PublicKey(terms.reference)
      const seller = new PublicKey(terms.seller)
      const chainMemo = buildChainMemo(brief, arg, terms.amountSol)
      if (trace) console.error(`[buyer] chain memo: ${chainMemo}`)
      const depositSig = await deposit(program, buyer, seller, reference, terms.amountSol, terms.deadlineSecs, chainMemo)
      console.error(`[buyer] round ${round}: DEPOSITED ${terms.amountSol} SOL → ${winner.by}`)
      if (trace) {
        console.error(`[buyer]   escrow PDA: ${expl('address', escrowPda(buyer.publicKey, reference).toBase58())}`)
        console.error(`[buyer]   deposit tx: ${expl('tx', depositSig)}`)
      }
      await ctx.send(
        formatDeposited({ round, reference: terms.reference, buyer: buyer.publicKey.toBase58(), sig: depositSig }),
        thread, [winner.by],
      )

      // ── wait for delivery, then score it before releasing funds ─────────────
      let deliveredText = ''
      const delivered = await waitFor(ctx, round, (t) => {
        const r = messageRound(t)
        if (verb(t) === 'DELIVERED' && r != null) { deliveredText = t; return { round: r } }
        return null
      }, 30_000)

      if (delivered) {
        // Score the delivery against the AC criteria — minimum 60 to release.
        const { score, acChecks, passed, summary } = await scoreDelivery(deliveredText, brief)
        console.error(`[buyer] round ${round}: delivery score=${score}/100 ${acChecks} — ${summary}`)

        const reportHash = createHash('sha256').update(deliveredText).digest('hex').slice(0, 12)
        const ref = brief.split(' | ').find((s) => s.startsWith('Ref:'))?.replace('Ref:', '').trim() ?? 'TenderNet'

        if (passed) {
          const releaseMemo = buildReleaseMemo(ref, winner.by, score, acChecks, proposalHashes, reportHash)
          const releaseSig = await releaseWithMemo(program, buyer, seller, reference, releaseMemo)
          console.error(`[buyer] round ${round}: RELEASED to ${winner.by} (score ${score}/100) — ${expl('tx', releaseSig)}`)
          if (trace) console.error(`[buyer]   release memo: ${releaseMemo}`)
          await ctx.send(`RELEASED round=${round} score=${score}/100 sig=${releaseSig}`, thread, [winner.by])
        } else {
          console.error(`[buyer] round ${round}: delivery FAILED quality check (score=${score}/100 < 60) — funds stay locked`)
          await ctx.send(`QUALITY_FAILED round=${round} score=${score}/100 reason="${summary}"`, thread, [winner.by])
        }
      } else {
        console.error(`[buyer] round ${round}: no delivery — funds stay in escrow, refundable after the deadline`)
      }
    } catch (e) {
      console.error(`[buyer] round error: ${e}`)
    }
    await sleep(CYCLE_MS)
    if (MAX_ROUNDS > 0 && round >= MAX_ROUNDS) {
      console.error(`[buyer] reached MAX_ROUNDS=${MAX_ROUNDS}, stopping.`)
      break
    }
  }
})
