import { useState } from 'react'
import type { Round } from '../types'
import { StatusPill } from './StatusPill'
import { BidRow, DeclinedRow } from './BidRow'
import { SettlementBadge } from './SettlementBadge'
import { WorldCupPanel } from './WorldCupPanel'
import { ReportBody } from './AgentGraph'

/** One auction round: the need, the competing bids, the award + reasoning, and on-chain settlement. */
export function RoundCard({ round }: { round: Round }) {
  const winner = round.award?.to
  const [briefOpen, setBriefOpen] = useState(false)
  return (
    <article className="round" data-testid="round" data-round={round.round}>
      <header className="round-head">
        {round.want && (
          <span className="round-want">
            <strong>Tender:</strong> {round.want.arg}
            <span className="round-budget">· budget {round.want.budgetSol} SOL</span>
          </span>
        )}
        <StatusPill status={round.status} />
      </header>
      {round.want?.brief && (
        <div className="brief-wrap">
          <button className="brief-toggle" onClick={() => setBriefOpen((o) => !o)}>
            {briefOpen ? '▲ Hide tender brief' : '▼ View tender brief'}
          </button>
          {briefOpen && (
            <div className="brief-body">
              {round.want.brief.split(' | ').map((section, i) => {
                const isAC = /^AC\d+:/.test(section)
                return (
                  <p key={i} className={isAC ? 'brief-ac' : 'brief-section'}>
                    {isAC
                      ? <><strong>{section.split(':')[0]}:</strong>{section.slice(section.indexOf(':') + 1)}</>
                      : section
                    }
                  </p>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="bids">
        {round.bids.map((b) => (
          <BidRow key={b.by} bid={b} won={b.by === winner} />
        ))}
        {round.declined.map((s) => (
          <DeclinedRow key={s} seller={s} />
        ))}
      </div>

      {round.award?.reason && (
        <p className="reason" data-testid="reason">
          <em>“{round.award.reason}”</em>
        </p>
      )}

      {round.delivered && (
        (round.delivered.data as { service?: string } | undefined)?.service === 'txline-edge'
          ? <WorldCupPanel edge={round.delivered.data as Parameters<typeof WorldCupPanel>[0]['edge']} />
          : <ReportBody round={round} />
      )}

      <footer className="settle-row">
        {round.deposit && <SettlementBadge label={`deposit ${round.escrow?.amountSol ?? ''} SOL`} sig={round.deposit.sig} />}
        {round.release && <SettlementBadge label="release" sig={round.release.sig} />}
        {round.refunded && <span className="settle settle-refund" data-testid="refund">refunded</span>}
      </footer>
    </article>
  )
}
