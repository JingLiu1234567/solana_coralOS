/**
 * LLM bidding — the seller's brain in the marketplace.
 *
 * On a WANT, the seller asks the LLM whether to bid and at what price, given its persona and cost
 * floor. The model PROPOSES; this code ENFORCES the economics, mirroring llm_buyer.ts:
 *   - never bid on a service it doesn't carry
 *   - never below its cost floor, never above the buyer's budget
 *   - if the floor exceeds the budget, sit the round out
 * A prompt injection inside a WANT therefore can't make the seller bid at a loss.
 */
import { complete, parseJsonReply, type Want, type CompleteOpts, type ProposalContent } from '@pay/agent-runtime'

export interface SellerConfig {
  name: string
  services: string[]
  floorSol: number
  persona: string
}

export interface BidDecision {
  bid: boolean
  priceSol: number
  note: string
}

/** Build a seller's market config from its env (set per persona in coral-agent.toml). */
export function sellerConfigFromEnv(name: string): SellerConfig {
  return {
    name,
    services: (process.env.SERVICES ?? 'jupiter,coingecko').split(',').map((s) => s.trim()).filter(Boolean),
    floorSol: Number(process.env.FLOOR_SOL ?? '0.0003'),
    persona: process.env.PERSONA ?? 'a fair, no-nonsense data seller',
  }
}

type Llm = (opts: CompleteOpts) => Promise<string>

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 3000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn() }
    catch (e) { if (i === retries) throw e; await new Promise((r) => setTimeout(r, delayMs)) }
  }
  throw new Error('unreachable')
}

/** Decide whether/how to bid. `llm` is injectable so tests run without the network. */
export async function decideBid(want: Want, cfg: SellerConfig, llm: Llm = complete): Promise<BidDecision> {
  // Hard guards first — no LLM call needed to refuse impossible jobs.
  if (!cfg.services.includes(want.service)) return { bid: false, priceSol: 0, note: 'not in inventory' }
  if (cfg.floorSol > want.budgetSol) return { bid: false, priceSol: 0, note: 'budget below floor' }

  const system =
    `You are ${cfg.name}, ${cfg.persona}. You sell Solana data services. Decide whether to bid on a ` +
    `request and at what price in SOL. Your cost floor is ${cfg.floorSol} SOL — never propose below it. ` +
    `Bid competitively: aim for 75-88% of the buyer's budget to reflect your quality and positioning. ` +
    `Bidding too low signals low quality; bidding at the budget cap reduces your chances. ` +
    `Reply ONLY with JSON: {"bid": boolean, "price": number, "note": string}. Keep note under 8 words.`
  const briefLine = want.brief ? `\ntender brief: ${want.brief}` : ''
  const user = `service=${want.service} arg=${want.arg} budget=${want.budgetSol} floor=${cfg.floorSol}${briefLine}`

  let proposed: number | undefined
  let note = ''
  try {
    const parsed = parseJsonReply<{ bid?: boolean; price?: number; note?: string }>(
      await llm({ system, user, maxTokens: 120 }),
    )
    if (parsed) {
      if (parsed.bid === false) return { bid: false, priceSol: 0, note: (parsed.note ?? 'declined').slice(0, 60) }
      proposed = typeof parsed.price === 'number' ? parsed.price : undefined
      note = (parsed.note ?? '').slice(0, 60)
    }
  } catch {
    // LLM unavailable → deterministic fallback below (bid at floor).
  }

  // Enforce the economics: clamp the price into [floor, budget].
  const priceSol = Math.min(want.budgetSol, Math.max(cfg.floorSol, proposed ?? cfg.floorSol))
  return { bid: true, priceSol, note: note || 'available' }
}

/** Generate a full ITT proposal responding specifically to each AC in the tender brief. */
export async function generateProposal(want: Want, cfg: SellerConfig, llm: Llm = complete): Promise<ProposalContent> {
  const brief = want.brief ?? ''
  const acCriteria = brief.split(' | ').filter((s) => /^AC\d+:/.test(s)).join('\n')
  const system =
    `You are ${cfg.name}, ${cfg.persona}. Write a formal UK government tender proposal responding to an Invitation to Tender. ` +
    `Reply ONLY with JSON: {"executive_summary": string, "methodology": string, ` +
    `"ac_responses": {"AC1": string, "AC2": string, "AC3": string, "AC4": string, "AC5": string}, ` +
    `"team_credentials": string, "social_value": string, "price_justification": string, "key_differentiator": string}. ` +
    `Each field should be 2-4 sentences. ac_responses must address EACH criterion specifically and concretely. ` +
    `key_differentiator must be ONE sentence (max 20 words) that pinpoints the single most compelling aspect of THIS proposal for THIS tender — e.g. a specific method, sample size, unique data source, or deliverable that competitors are unlikely to match. Do NOT describe the company; describe what makes THIS submission stand out.`
  const user =
    `Tender title: ${want.arg}\nBudget: ${want.budgetSol} SOL\nYour floor price: ${cfg.floorSol} SOL\n\n` +
    `Acceptance criteria to address:\n${acCriteria || 'Provide comprehensive industry analysis.'}`
  try {
    const raw = await withRetry(() => llm({ system, user, maxTokens: 1500 }))
    const parsed = parseJsonReply<ProposalContent>(raw)
    if (parsed?.executive_summary) return parsed
    console.error(`[${cfg.name}] generateProposal: parse failed. raw=${raw.slice(0, 400)}`)
  } catch (e) {
    console.error(`[${cfg.name}] generateProposal: LLM error — ${e}`)
  }

  // Dynamic fallback: generate AC responses from the actual AC text so they remain topically relevant
  // even when the LLM call fails — avoids submitting answers that address the wrong criteria entirely.
  const acFallback: Record<string, string> = {}
  for (const segment of brief.split(' | ').filter((s) => /^AC\d+:/.test(s))) {
    const m = segment.match(/^(AC\d+):\s*(.+)/)
    if (m) acFallback[m[1]] = `${cfg.name} confirms delivery against this criterion: ${m[2].trim()}`
  }
  if (!acFallback.AC1) { acFallback.AC1 = 'Full methodology and evidence as specified.'; acFallback.AC2 = 'Stakeholder coverage per brief.'; acFallback.AC3 = 'Analysis and findings per brief.'; acFallback.AC4 = 'Compliance and benchmarking per brief.'; acFallback.AC5 = 'Policy recommendations with named bodies and timelines.' }
  return {
    executive_summary: `${cfg.name} proposes a rigorous, mixed-methods research programme on "${want.arg}", drawing on our established public sector research partnerships and delivering outputs that meet all specified acceptance criteria.`,
    methodology: 'Nationally representative survey combined with qualitative focus groups, followed by comparative analysis against international benchmarks and policy gap review.',
    ac_responses: acFallback,
    team_credentials: `${cfg.name} has delivered 12 public sector research projects in the past 3 years, including commissioned work for DSIT and the Local Government Association.`,
    social_value: 'Dedicated outreach to low-income and low-digital-literacy communities; all fieldwork conducted by locally recruited researchers.',
    price_justification: `Our bid reflects efficient delivery through existing panel partnerships, passing cost savings directly to the contracting authority.`,
  }
}
