/**
 * ChatView — real-time agent conversation stream, ChatDev style.
 * Left-aligned = seller messages. Right-aligned = buyer messages.
 */
import { useEffect, useRef } from 'react'
import type { ClassifiedMessage } from '../types'
import { AGENTS } from './GraphView'

const TYPE_BADGE: Record<string, { label: string; bg: string }> = {
  'want':         { label: 'WANT',          bg: '#1d4ed8' },
  'bid':          { label: 'BID',           bg: '#92400e' },
  'award':        { label: 'AWARD',         bg: '#166534' },
  'escrow-funded':{ label: 'ESCROW FUNDED', bg: '#4c1d95' },
  'draft':        { label: 'DRAFT',         bg: '#0c4a6e' },
  'review':       { label: 'REVIEW',        bg: '#713f12' },
  'approved':     { label: 'APPROVED',      bg: '#14532d' },
  'delivered':    { label: 'DELIVERED',     bg: '#1e3a5f' },
  'released':     { label: 'RELEASED',      bg: '#14F195' },
  'message':      { label: 'MSG',           bg: '#374151' },
}

function scoreFromText(text: string): number | null {
  const m = text.match(/Score:\s*(\d+)\/100/i)
  return m ? Number(m[1]) : null
}

interface BubbleProps { msg: ClassifiedMessage; isLast: boolean }

function Bubble({ msg, isLast }: BubbleProps) {
  const isBuyer = msg.sender === 'buyer'
  const info = AGENTS[msg.sender] ?? { label: msg.sender, emoji: '🤖', color: '#64748b' }
  const badge = TYPE_BADGE[msg.type] ?? TYPE_BADGE['message']
  const score = msg.type === 'review' ? scoreFromText(msg.text) : null
  const lines = msg.text.trim().split('\n').slice(0, 12)
  const truncated = msg.text.trim().split('\n').length > 12

  return (
    <div className={`cv-row ${isBuyer ? 'cv-row-right' : 'cv-row-left'} ${isLast ? 'cv-row-new' : ''}`}>
      {!isBuyer && (
        <div className="cv-avatar" style={{ background: `${info.color}22`, borderColor: `${info.color}44` }}>
          <span>{info.emoji}</span>
        </div>
      )}
      <div className="cv-bubble-wrap">
        <div className={`cv-meta ${isBuyer ? 'cv-meta-right' : ''}`}>
          <span className="cv-sender" style={{ color: info.color }}>{info.label}</span>
          <span className="cv-model">Claude Code</span>
        </div>
        <div className={`cv-bubble ${isBuyer ? 'cv-bubble-right' : 'cv-bubble-left'}`}
             style={{ borderColor: `${info.color}33` }}>
          <div className="cv-bubble-head">
            <span className="cv-badge" style={{ background: badge.bg }}>{badge.label}</span>
            {score !== null && (
              <span className={`cv-score ${score >= 60 ? 'cv-score-pass' : 'cv-score-fail'}`}>
                {score}/100
              </span>
            )}
          </div>
          <div className="cv-text">
            {lines.map((line, i) => (
              <p key={i} className={line === '' ? 'cv-blank' : ''}>{line || ' '}</p>
            ))}
            {truncated && <p className="cv-truncated">… (truncated)</p>}
          </div>
        </div>
      </div>
      {isBuyer && (
        <div className="cv-avatar cv-avatar-right" style={{ background: `${info.color}22`, borderColor: `${info.color}44` }}>
          <span>{info.emoji}</span>
        </div>
      )}
    </div>
  )
}

interface Props { messages: ClassifiedMessage[] }

export function ChatView({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="cv-empty">
        <div className="cv-empty-icon">💬</div>
        <p>Waiting for agents to connect and start communicating…</p>
      </div>
    )
  }

  return (
    <div className="cv-feed">
      <div className="cv-started">
        <span>── Workflow execution started ──</span>
      </div>
      {messages.map((m, i) => (
        <Bubble key={m.index} msg={m} isLast={i === messages.length - 1} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
