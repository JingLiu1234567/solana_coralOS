/**
 * AgentGraph — LangSmith-style two-pane trace view.
 *
 * Left pane:  compact tree (shrinks when panel is open)
 * Right pane: detail panel slides in when a row is clicked
 *
 * Colors are AGENT-CONSISTENT: same agent = same color regardless of action.
 * BID rows are indented as children of WANT to show the response hierarchy.
 */
import { useState, useEffect } from 'react'
import type { Round } from '../types'
import { explorerTx } from '../types'

// ── Agent identity (color never changes per agent) ────────────────────────────
export const SELLER_INFO: Record<string, { initials: string; color: string; name: string }> = {
  'insight-research':    { initials: 'IR', color: '#22c55e', name: 'Insight Research Ltd' },
  'whitehall-analytics': { initials: 'WA', color: '#f97316', name: 'Whitehall Analytics' },
  'stratford-advisory':  { initials: 'SA', color: '#a855f7', name: 'Stratford Advisory' },
  'seller-worldcup':     { initials: 'WC', color: '#eab308', name: 'WorldCup Analyst' },
}
const BUYER  = { initials: 'BUYER',  color: '#60a5fa', name: 'UK Govt Buyer' }
const ESCROW = { initials: 'ESCROW', color: '#14F195', name: 'Solana Escrow' }
const JUDGE  = { initials: 'JUDGE',  color: '#f87171', name: 'LLM Judge' }

// ── Score count-up ─────────────────────────────────────────────────────────────
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n >= to) return
    const id = setTimeout(() => setN((p) => Math.min(p + Math.max(1, Math.ceil(to / 18)), to)), 38)
    return () => clearTimeout(id)
  }, [n, to])
  return <>{n}</>
}

// ── Detail panel content components ───────────────────────────────────────────
interface BriefSection { label: string; text: string }
function parseBrief(brief: string): BriefSection[] {
  return brief.split(' | ').map(s => {
    const i = s.indexOf(':')
    return i < 0 ? { label: '', text: s.trim() } : { label: s.slice(0, i).trim(), text: s.slice(i + 1).trim() }
  }).filter(s => s.text)
}

function BriefDetail({ want }: { want: NonNullable<Round['want']> }) {
  const sections = parseBrief(want.brief ?? '')
  const main = sections.filter(s => !/^AC\d+$/.test(s.label))
  const acs  = sections.filter(s => /^AC\d+$/.test(s.label))
  return (
    <div className="ag-panel-content">
      <div className="ag-panel-section">
        <span className="ag-panel-label">Budget</span>
        <p>{want.budgetSol} SOL</p>
      </div>
      {main.map((s, i) => (
        <div key={i} className="ag-panel-section">
          {s.label && <span className="ag-panel-label">{s.label}</span>}
          <p>{s.text}</p>
        </div>
      ))}
      {acs.length > 0 && (
        <div className="ag-panel-section">
          <span className="ag-panel-label">Acceptance Criteria</span>
          {acs.map((s, i) => (
            <div key={i} className="ag-panel-ac">
              <span className="ag-ac-tag">{s.label}</span>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProposalDetail({ bid }: { bid: Round['bids'][0] }) {
  const p = (bid as any).proposal
  if (!p) return <div className="ag-panel-content"><p className="ag-panel-empty">No proposal data.</p></div>
  return (
    <div className="ag-panel-content">
      <div className="ag-panel-section">
        <span className="ag-panel-label">Price</span>
        <p>{bid.priceSol} SOL</p>
      </div>
      {p.executive_summary && <div className="ag-panel-section"><span className="ag-panel-label">Executive Summary</span><p>{p.executive_summary}</p></div>}
      {p.methodology && <div className="ag-panel-section"><span className="ag-panel-label">Methodology</span><p>{p.methodology}</p></div>}
      {p.ac_responses && Object.entries(p.ac_responses as Record<string, string>).map(([key, val]) => (
        <div key={key} className="ag-panel-ac"><span className="ag-ac-tag">{key}</span><p>{val}</p></div>
      ))}
      {p.team_credentials && <div className="ag-panel-section"><span className="ag-panel-label">Team Credentials</span><p>{p.team_credentials}</p></div>}
      {p.social_value && <div className="ag-panel-section"><span className="ag-panel-label">Social Value</span><p>{p.social_value}</p></div>}
      {p.price_justification && <div className="ag-panel-section"><span className="ag-panel-label">Price Justification</span><p>{p.price_justification}</p></div>}
    </div>
  )
}

export function ReportBody({ round }: { round: Round }) {
  const delivered = round.delivered
  if (!delivered) return null
  let data: Record<string, unknown> | null = null
  try { data = JSON.parse(delivered.raw) as Record<string, unknown> } catch { }
  const r = data?.report as Record<string, unknown> | undefined
  return (
    <div className="ag-panel-content ag-report-body">
      {!!r?.executive_summary && <div className="ag-panel-section"><span className="ag-panel-label">Executive Summary</span><p>{String(r.executive_summary)}</p></div>}
      {!!r?.market_size && <div className="ag-panel-section"><span className="ag-panel-label">Market Size</span><p>{String(r.market_size)}</p></div>}
      {Array.isArray(r?.key_findings) && <div className="ag-panel-section"><span className="ag-panel-label">Key Findings</span><ul className="ag-report-list">{(r.key_findings as string[]).map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
      {Array.isArray(r?.key_players) && <div className="ag-panel-section"><span className="ag-panel-label">Key Players</span><ul className="ag-report-list">{(r.key_players as string[]).map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      {Array.isArray(r?.risks) && <div className="ag-panel-section"><span className="ag-panel-label">Risks</span><ul className="ag-report-list">{(r.risks as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {Array.isArray(r?.recommendations) && <div className="ag-panel-section"><span className="ag-panel-label">Recommendations</span><ul className="ag-report-list">{(r.recommendations as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {!r && <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 10, wordBreak: 'break-all', color: 'var(--dim)', whiteSpace: 'pre-wrap' }}>{delivered.raw.slice(0, 800)}</pre>}
    </div>
  )
}

// ── Panel state ────────────────────────────────────────────────────────────────
interface PanelState {
  key: string
  title: string
  agentColor: string
  agentInitials: string
  content: React.ReactNode
}

// ── Tree row ───────────────────────────────────────────────────────────────────
interface TreeRowProps {
  color: string
  initials: string
  name: string
  verb: string
  summary?: string
  badge?: React.ReactNode
  txSig?: string
  animIdx: number
  hasDetail?: boolean
  selected?: boolean
  onSelect?: () => void
}

function TreeRow({ color, initials, name, verb, summary, badge, txSig, animIdx, hasDetail, selected, onSelect }: TreeRowProps) {
  const css = { '--agent-color': color, '--anim-idx': animIdx } as React.CSSProperties
  return (
    <div
      className={`ag-row-wrap ${selected ? 'ag-row-selected' : ''}`}
      style={css}
      onClick={hasDetail ? onSelect : undefined}
    >
      <div className="ag-row" style={{ cursor: hasDetail ? 'pointer' : 'default' }}>
        {/* Colored dot */}
        <div className="ag-row-dot" style={{ background: color, boxShadow: `0 0 5px ${color}88` }} />

        {/* Agent icon badge */}
        <div className="ag-row-icon" style={{ background: `${color}18`, borderColor: `${color}40`, color }}>
          {initials}
        </div>

        {/* name · verb · summary */}
        <div className="ag-row-text">
          <span className="ag-row-name" style={{ color }}>{name}</span>
          <span className="ag-row-sep">·</span>
          <span className="ag-row-verb">{verb}</span>
          {summary && <span className="ag-row-summary">· {summary}</span>}
        </div>

        {/* Right: badge + tx + chevron */}
        <div className="ag-row-end">
          {badge}
          {txSig && (
            <a href={explorerTx(txSig)} target="_blank" rel="noreferrer"
               className="ag-chain-link ag-row-tx"
               onClick={e => e.stopPropagation()}>
              ↗ tx
            </a>
          )}
          {hasDetail && (
            <span className={`ag-row-chevron ${selected ? 'ag-row-chevron-open' : ''}`}>›</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────
const STEPS = [
  'Tender brief published', 'Sellers reviewing brief', 'Proposals & bids received',
  'Winner awarded', 'Escrow funded on Solana', 'Report delivered & verified', 'Payment released ✅',
]
function stepIndex(round: Round): number {
  if (round.release)          return 6
  if (round.delivered)        return 5
  if (round.deposit)          return 4
  if (round.award)            return 3
  if (round.bids.length > 0)  return 2
  if (round.want)             return 1
  return 0
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function AgentGraph({ round }: { round: Round | undefined }) {
  const [panel, setPanel] = useState<PanelState | null>(null)

  if (!round?.want) return null

  const idx         = stepIndex(round)
  const winner      = round.award?.to
  const winnerAgent = winner
    ? (SELLER_INFO[winner] ?? { name: winner, color: '#64748b', initials: winner.slice(0, 2).toUpperCase() })
    : null
  const isSettled   = round.status === 'settled' || !!round.release || !!round.qualityFailed

  function select(p: PanelState) {
    setPanel(prev => prev?.key === p.key ? null : p)
  }

  let ai = 0

  return (
    <div className="ag-wrap">
      {/* Header */}
      <div className="ag-header">
        <span className="ag-coral-tag">CoralOS</span>
        <span className="ag-header-text">Protocol Trace · TenderNet</span>
        <span className="ag-header-session">Round {round.round}</span>
        <span className={`ag-dot ${isSettled ? 'ag-dot-done' : 'ag-dot-live'}`} />
      </div>

      {/* Two-pane layout */}
      <div className={`ag-layout ${panel ? 'ag-layout-split' : ''}`}>

        {/* ── Left: tree pane ── */}
        <div className="ag-tree-pane">
          <div className="ag-trace">

            {/* ── Phase: Tender ── */}
            <div className="ag-phase-sep ag-phase-sep-tender">Tender</div>

            {/* WANT */}
            <TreeRow
              color={BUYER.color} initials={BUYER.initials} name={BUYER.name}
              verb="WANT" summary={round.want.arg}
              animIdx={ai++}
              hasDetail
              selected={panel?.key === 'want'}
              onSelect={() => select({
                key: 'want', title: 'WANT — Tender Brief',
                agentColor: BUYER.color, agentInitials: BUYER.initials,
                content: <BriefDetail want={round.want!} />,
              })}
            />

            {/* BID group — indented children of WANT */}
            {(round.bids.length > 0 || round.declined.length > 0) && (
              <div className="ag-bid-group" style={{ '--anim-idx': ai } as React.CSSProperties}>
                <div className="ag-group-label">Proposals received ({round.bids.length + round.declined.length})</div>
                {round.bids.map((bid) => {
                  const info = SELLER_INFO[bid.by] ?? { name: bid.by, color: '#64748b', initials: bid.by.slice(0, 2).toUpperCase() }
                  const isWinner = bid.by === winner
                  const rowKey = `bid-${bid.by}`
                  return (
                    <TreeRow
                      key={bid.by}
                      color={info.color} initials={info.initials} name={info.name}
                      verb="BID + PROPOSAL" summary={`${bid.priceSol} SOL`}
                      animIdx={ai++}
                      hasDetail
                      selected={panel?.key === rowKey}
                      badge={isWinner && round.award ? <span className="ag-won-badge">AWARDED ✓</span> : undefined}
                      onSelect={() => select({
                        key: rowKey, title: `${info.name} — BID + PROPOSAL`,
                        agentColor: info.color, agentInitials: info.initials,
                        content: <ProposalDetail bid={bid} />,
                      })}
                    />
                  )
                })}
                {round.declined.map((s) => {
                  const info = SELLER_INFO[s] ?? { name: s, color: '#4b5563', initials: s.slice(0, 2).toUpperCase() }
                  return (
                    <TreeRow
                      key={s}
                      color="#4b5563" initials={info.initials} name={info.name}
                      verb="DECLINED" summary="Service not in inventory"
                      animIdx={ai++}
                    />
                  )
                })}
              </div>
            )}

            {/* ── Phase: Award — contract decision + escrow funded ── */}
            {round.award && <div className="ag-phase-sep">Award</div>}

            {/* AWARD */}
            {round.award && (
              <TreeRow
                color={BUYER.color} initials={BUYER.initials} name={BUYER.name}
                verb="AWARD"
                summary={`→ ${winnerAgent?.name ?? winner ?? ''}`}
                animIdx={ai++}
              />
            )}

            {/* DEPOSITED — escrow funded immediately after award */}
            {round.deposit && (
              <TreeRow
                color={ESCROW.color} initials={ESCROW.initials} name={ESCROW.name}
                verb="ESCROW FUNDED"
                summary={`${round.escrow?.amountSol ?? ''} SOL locked`}
                txSig={round.deposit.sig}
                animIdx={ai++}
              />
            )}

            {/* ── Phase: Delivery — work done, quality check, payout ── */}
            {(round.delivered || round.qualityFailed || round.release) && (
              <div className="ag-phase-sep ag-phase-sep-delivery">Delivery</div>
            )}

            {/* DELIVERED — score badge goes here: it's WA's work quality, not Solana's */}
            {round.delivered && (
              <TreeRow
                color={winnerAgent?.color ?? '#10b981'}
                initials={winnerAgent?.initials ?? 'WIN'}
                name={winnerAgent?.name ?? 'Winner'}
                verb="DELIVERED" summary="Final research report"
                animIdx={ai++}
                hasDetail
                selected={panel?.key === 'delivered'}
                badge={
                  round.release?.score !== undefined
                    ? <span className="ag-score-inline ag-score-pass">Score <CountUp to={round.release.score} />/100 ✅</span>
                    : round.release
                      ? <span className="ag-score-inline ag-score-pass">Quality passed ✅</span>
                      : undefined
                }
                onSelect={() => select({
                  key: 'delivered', title: 'DELIVERED — Final Report',
                  agentColor: winnerAgent?.color ?? '#10b981',
                  agentInitials: winnerAgent?.initials ?? 'WIN',
                  content: <ReportBody round={round} />,
                })}
              />
            )}

            {/* QUALITY FAILED */}
            {round.qualityFailed && (
              <TreeRow
                color={JUDGE.color} initials={JUDGE.initials} name={JUDGE.name}
                verb="QUALITY FAILED"
                summary={`Score ${round.qualityFailed.score}/100`}
                animIdx={ai++}
              />
            )}

            {/* ESCROW RELEASED — just the financial action + tx link, no score here */}
            {round.release && (
              <TreeRow
                color={ESCROW.color} initials={ESCROW.initials} name={ESCROW.name}
                verb="ESCROW RELEASED"
                summary={`${round.escrow?.amountSol ?? ''} SOL → ${winnerAgent?.name ?? winner ?? ''}`}
                animIdx={ai++}
                txSig={round.release.sig}
              />
            )}

            {/* Waiting */}
            {!isSettled && (
              <div className="ag-trace-waiting" style={{ '--anim-idx': ai } as React.CSSProperties}>
                <div className="ag-trace-wait-dot" />
                <span>waiting for next protocol message…</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: detail panel ── */}
        {panel && (
          <div className="ag-detail-pane" key={panel.key}>
            {/* Panel header */}
            <div className="ag-panel-head">
              <div className="ag-panel-head-icon"
                   style={{ background: `${panel.agentColor}22`, borderColor: `${panel.agentColor}50`, color: panel.agentColor }}>
                {panel.agentInitials}
              </div>
              <span className="ag-panel-head-title" style={{ color: panel.agentColor }}>{panel.title}</span>
              <button className="ag-panel-close" onClick={() => setPanel(null)} aria-label="close panel">✕</button>
            </div>

            {/* Panel body — scrollable */}
            <div className="ag-panel-body">
              {panel.content}
            </div>
          </div>
        )}
      </div>

      {/* Step progress bar */}
      <div className="ag-steps">
        <div className="ag-step-dots">
          {STEPS.map((_, i) => (
            <div key={i}
              className={`ag-step-dot ${i < idx ? 'ag-step-done' : i === idx ? 'ag-step-active' : 'ag-step-future'}`}
            />
          ))}
        </div>
        <div className="ag-step-label">
          <span className="ag-step-n">Step {idx + 1}/{STEPS.length}</span>
          {STEPS[idx]}
        </div>
      </div>
    </div>
  )
}
