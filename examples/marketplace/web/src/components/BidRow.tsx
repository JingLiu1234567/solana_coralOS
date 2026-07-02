import { useState } from 'react'
import type { RoundBid } from '../types'
import { SELLER_INFO } from './AgentGraph'

export function BidRow({ bid, won }: { bid: RoundBid; won: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`bid ${won ? 'bid-won' : ''}`} data-testid="bid" data-seller={bid.by}>
      <div className="bid-main">
        <span className="bid-seller">{SELLER_INFO[bid.by]?.name ?? bid.by}</span>
        {bid.priceSol > 0 && <span className="bid-price">{bid.priceSol} SOL</span>}
        {bid.note && <span className="bid-note">{bid.note}</span>}
        {won && <span className="bid-tag">won</span>}
        {bid.proposal && (
          <button className="proposal-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? '▲ Hide proposal' : '▼ View proposal'}
          </button>
        )}
      </div>
      {open && bid.proposal && (
        <div className="proposal-body">
          <div className="proposal-section">
            <span className="proposal-label">Executive Summary</span>
            <p>{bid.proposal.executive_summary}</p>
          </div>
          <div className="proposal-section">
            <span className="proposal-label">Methodology</span>
            <p>{bid.proposal.methodology}</p>
          </div>
          {Object.entries(bid.proposal.ac_responses).map(([ac, response]) => (
            <div key={ac} className="proposal-section proposal-ac">
              <span className="proposal-label">{ac} Response</span>
              <p>{response}</p>
            </div>
          ))}
          <div className="proposal-section">
            <span className="proposal-label">Team Credentials</span>
            <p>{bid.proposal.team_credentials}</p>
          </div>
          <div className="proposal-section">
            <span className="proposal-label">Social Value</span>
            <p>{bid.proposal.social_value}</p>
          </div>
          <div className="proposal-section">
            <span className="proposal-label">Price Justification</span>
            <p>{bid.proposal.price_justification}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function DeclinedRow({ seller }: { seller: string }) {
  return (
    <div className="bid bid-declined" data-testid="declined" data-seller={seller}>
      <span className="bid-seller">{SELLER_INFO[seller]?.name ?? seller}</span>
      <span className="bid-note">declined — not in inventory</span>
    </div>
  )
}
