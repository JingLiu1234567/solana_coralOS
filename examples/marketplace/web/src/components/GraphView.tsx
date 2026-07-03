/**
 * GraphView — ChatDev-style agent topology canvas.
 * Shows buyer + seller nodes connected by SVG bezier curves, walked by a little pixel-art courier
 * (not a bare dot) while a message is in flight. Active sender pulses; the awarded winner gets a
 * highlighted connection.
 */
import { useEffect, useState } from 'react'
import type { Round } from '../types'
import type { ClassifiedMessage } from '../types'
import { PixelBody, PixelAgentIcon } from './PixelSprite'

export const AGENTS: Record<string, { label: string; color: string; sub: string }> = {
  buyer:                { label: 'UK Govt Buyer',        color: '#60a5fa', sub: 'BUYER' },
  'whitehall-analytics':{ label: 'Whitehall Analytics',  color: '#f97316', sub: 'AGENT' },
  'insight-research':   { label: 'Insight Research',     color: '#22c55e', sub: 'AGENT' },
  'stratford-advisory': { label: 'Stratford Advisory',   color: '#a855f7', sub: 'AGENT' },
}
const UNKNOWN = { label: 'Agent', color: '#64748b', sub: 'AGENT' }

/** SMIL's animateMotion ignores the CSS reduced-motion media query, so gate it in JS. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// Fixed positions (% of canvas). Kept within the top ~60% of the canvas height so the bottom panel
// (phase label + latest-message card) always has clear room below the lowest node, even with all
// three sellers visible.
const POSITIONS: Record<string, { x: number; y: number }> = {
  buyer:                 { x: 72, y: 38 },
  'whitehall-analytics': { x: 22, y: 14 },
  'insight-research':    { x: 22, y: 38 },
  'stratford-advisory':  { x: 22, y: 62 },
}

const NODE_W = 180
const NODE_H = 72

interface Props {
  round?: Round
  lastSender?: string
  sessionActive: boolean
  lastMessage?: ClassifiedMessage
}

/** First few non-empty lines, wire-protocol prefix stripped, capped so the card stays a fixed size. */
function messagePreview(text: string): string {
  const nonEmpty = text.trim().split('\n').filter((l) => l.trim().length > 0)
  const [first, ...rest] = nonEmpty
  const strippedFirst = (first ?? '').replace(/^(WANT|BID|AWARD|ESCROW_FUNDED|DRAFT_SUBMISSION|REVIEW_FEEDBACK|DRAFT_APPROVED|DELIVERED|ESCROW_RELEASED)\b\s*(round=\S+\s*)?/i, '').trim()
  const body = [strippedFirst || first || '', ...rest].join(' ').trim()
  return body.length > 400 ? `${body.slice(0, 400)}…` : body
}

export function GraphView({ round, lastSender, sessionActive, lastMessage }: Props) {
  const reducedMotion = usePrefersReducedMotion()
  const winner = round?.award?.to
  const sellers = ['whitehall-analytics', 'insight-research', 'stratford-advisory']
  // Once a winner is picked, the losing sellers have no further part to play — drop them from the
  // canvas entirely instead of just dimming them, so the graph reads as "buyer ↔ winner" post-award.
  const visibleSellers = winner ? sellers.filter((s) => s === winner) : sellers
  // Recenter the sole remaining seller onto the buyer's vertical so the two-party view reads cleanly.
  const positionFor = (id: string) => (winner && id === winner ? { x: POSITIONS[id].x, y: POSITIONS['buyer'].y } : POSITIONS[id])

  return (
    <div className="gv-canvas">
      {/* dot-grid pattern via CSS background */}
      <svg className="gv-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {visibleSellers.map((s) => {
          const from = positionFor(s)
          const to = POSITIONS['buyer']
          if (!from || !to) return null
          const isWinner = winner === s
          // Once awarded, only the buyer↔winner exchange should ever animate.
          const isActive = (lastSender === s || lastSender === 'buyer') && (!winner || isWinner)
          const x1 = from.x + (NODE_W / 2 / 14)
          const y1 = from.y
          const x2 = to.x - (NODE_W / 2 / 14)
          const y2 = to.y
          const cx1 = x1 + (x2 - x1) * 0.4
          const cx2 = x2 - (x2 - x1) * 0.4
          const info = AGENTS[s] ?? UNKNOWN
          return (
            <g key={s}>
              <path
                d={`M${x1} ${y1} C${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={isWinner ? info.color : '#334155'}
                strokeWidth={isWinner ? '0.4' : '0.2'}
                strokeDasharray={isActive && !isWinner ? '1 0.8' : undefined}
                className={isActive ? 'gv-line-active' : ''}
              />
              {isActive && (
                reducedMotion ? (
                  // Reduced motion: park the courier at the destination, no travel animation.
                  <svg x={(lastSender === s ? x2 : x1) - 2} y={(lastSender === s ? y2 : y1) - 2.25}
                       width="4" height="4.5" viewBox="0 0 16 18" shapeRendering="crispEdges">
                    <PixelBody color={info.color} />
                  </svg>
                ) : (
                  <svg x="-2" y="-2.25" width="4" height="4.5" viewBox="0 0 16 18" shapeRendering="crispEdges"
                       className="gv-courier">
                    <PixelBody color={info.color} walking />
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path={lastSender === s
                        ? `M${x1} ${y1} C${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`
                        : `M${x2} ${y2} C${cx2} ${y2}, ${cx1} ${y1}, ${x1} ${y1}`}
                    />
                  </svg>
                )
              )}
            </g>
          )
        })}
      </svg>

      {/* Agent nodes */}
      {['buyer', ...visibleSellers].map((id) => {
        const pos = positionFor(id)
        const info = AGENTS[id] ?? UNKNOWN
        const isActive = lastSender === id
        const isWinner = winner === id
        const isBuyer = id === 'buyer'
        return (
          <div
            key={id}
            className={`gv-node ${isActive ? 'gv-node-active' : ''}`}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              '--node-color': info.color,
            } as React.CSSProperties}
          >
            <div className="gv-node-avatar"><PixelAgentIcon color={info.color} size={32} /></div>
            <div className="gv-node-box" style={{ borderColor: isActive ? info.color : isWinner ? info.color : undefined }}>
              <span className="gv-node-sub">{isBuyer ? 'HUMAN' : info.sub}</span>
              <span className="gv-node-name">{info.label}</span>
              {isWinner && <span className="gv-node-won">AWARDED ✓</span>}
            </div>
            {isActive && sessionActive && (
              <div className="gv-node-pulse" style={{ borderColor: info.color }} />
            )}
          </div>
        )
      })}

      {/* Bottom panel: phase status + latest-message card, anchored together so their combined
          height stays within the clear zone reserved below the lowest node (see POSITIONS). */}
      {(round || lastMessage) && (
        <div className="gv-bottom-panel">
          {round && (
            <div className="gv-phase-label">
              {!round.want && 'Waiting for tender…'}
              {round.want && !round.award && `📋 Tender open · ${round.bids.length} bid(s) received`}
              {round.award && !round.deposit && `🏆 Awarded → ${AGENTS[round.award.to]?.label ?? round.award.to}`}
              {round.deposit && !round.draftApproved && !round.release && '📝 Draft review in progress…'}
              {round.draftApproved && !round.release && '✅ Draft approved · releasing payment…'}
              {round.release && '💰 Contract settled on Solana'}
            </div>
          )}
          {lastMessage && (
            <div className="gv-message-ticker">
              <span className="gv-message-sender" style={{ color: (AGENTS[lastMessage.sender] ?? UNKNOWN).color }}>
                <PixelAgentIcon color={(AGENTS[lastMessage.sender] ?? UNKNOWN).color} size={16} />
                {(AGENTS[lastMessage.sender] ?? UNKNOWN).label}
              </span>
              <span className="gv-message-text">{messagePreview(lastMessage.text)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
