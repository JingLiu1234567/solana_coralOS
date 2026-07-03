import { useState } from 'react'
import { useFeed, useMessages, startMarket } from './api'
import { GraphView } from './components/GraphView'
import { ChatView } from './components/ChatView'
import { PixelAgentIcon } from './components/PixelSprite'
import { explorerTx } from './types'

const initialSession = new URLSearchParams(window.location.search).get('session') ?? ''

type ViewMode = 'graph' | 'chat'

export default function App() {
  const [session, setSession] = useState(initialSession)
  const [starting, setStarting] = useState(false)
  const [startErr, setStartErr] = useState<string>()
  const [view, setView] = useState<ViewMode>('graph')

  const { rounds, connected, error } = useFeed(session)
  const { messages } = useMessages(session)

  // Prefer the latest round that actually has a WANT (a real tender) — guards against a stray/
  // mistagged message creating an empty phantom round that would otherwise eclipse a finished one.
  const round = [...rounds].reverse().find(r => r.want) ?? rounds[rounds.length - 1]
  const lastMessage = messages[messages.length - 1]
  const lastSender = lastMessage?.sender
  const isSettled = round?.status === 'settled' || round?.status === 'refunded'
  const statusLabel = !session ? 'Idle'
    : !connected ? 'Connecting…'
    : isSettled ? 'Done ✓'
    : rounds.length > 0 ? 'Running…'
    : 'Waiting…'

  async function onStart() {
    setStarting(true); setStartErr(undefined)
    try {
      const id = await startMarket()
      setSession(id)
      const url = new URL(window.location.href)
      url.searchParams.set('session', id)
      window.history.replaceState({}, '', url)
    } catch (e) { setStartErr((e as Error).message) }
    finally { setStarting(false) }
  }

  return (
    <div className="layout">
      {/* ── Main canvas ── */}
      <div className="canvas-area">
        {view === 'graph'
          ? <GraphView round={round} lastSender={lastSender} sessionActive={connected && !isSettled} lastMessage={lastMessage} />
          : <ChatView messages={messages} />
        }

        {/* bottom input bar */}
        <div className="canvas-bottom">
          <input
            className="canvas-input"
            placeholder="Paste a session ID or click Launch a Tender →"
            value={session}
            onChange={e => setSession(e.target.value.trim())}
          />
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-title">TenderNet</div>

        <div className="sidebar-section">
          <div className="sidebar-label">SESSION</div>
          <div className="sidebar-session">{session || '—'}</div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">STATUS</div>
          <div className={`sidebar-status ${isSettled ? 'status-done' : connected && session ? 'status-running' : 'status-idle'}`}>
            {statusLabel}
          </div>
          {error && <div className="sidebar-err">{error}</div>}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">VIEW</div>
          <div className="view-toggle">
            <button className={view === 'chat' ? 'toggle-active' : ''} onClick={() => setView('chat')}>Chat</button>
            <button className={view === 'graph' ? 'toggle-active' : ''} onClick={() => setView('graph')}>Graph</button>
          </div>
        </div>

        <div className="sidebar-section">
          <button className="btn-launch" onClick={onStart} disabled={starting}>
            {starting ? 'Launching…' : 'Launch a Tender'}
          </button>
          {startErr && <p className="sidebar-err">{startErr}</p>}
        </div>

        {/* Agent legend */}
        <div className="sidebar-section sidebar-legend">
          <div className="sidebar-label">AGENTS</div>
          {[
            { id: 'buyer',                name: 'UK Govt Buyer',       color: '#60a5fa', role: 'BUYER' },
            { id: 'whitehall-analytics',  name: 'Whitehall Analytics', color: '#f97316', role: 'SELLER' },
            { id: 'insight-research',     name: 'Insight Research',    color: '#22c55e', role: 'SELLER' },
            { id: 'stratford-advisory',   name: 'Stratford Advisory',  color: '#a855f7', role: 'SELLER' },
          ].map(a => (
            <div key={a.id} className="legend-row">
              <PixelAgentIcon color={a.color} size={18} className="legend-sprite" />
              <div className="legend-info">
                <span className="legend-name">{a.name}</span>
                <span className="legend-role">{a.role}</span>
              </div>
              {lastSender === a.id && <span className="legend-active">●</span>}
            </div>
          ))}
        </div>

        {/* Stats */}
        {round && (
          <div className="sidebar-section sidebar-stats">
            <div className="sidebar-label">ROUND {round.round}</div>
            <div className="stat-row"><span>Bids</span><span>{round.bids.length}</span></div>
            {round.award && <div className="stat-row"><span>Winner</span><span style={{color:'#22c55e'}}>{round.award.to}</span></div>}
            {round.deposit && (
              <div className="stat-row">
                <span>Escrow</span>
                <a href={explorerTx(round.deposit.sig)} target="_blank" rel="noreferrer" style={{color:'#9945FF'}}>
                  Funded ↗
                </a>
              </div>
            )}
            {round.draftApproved && <div className="stat-row"><span>Score</span><span style={{color:'#14F195'}}>{round.draftApproved.finalScore}/100</span></div>}
            {round.release && (
              <div className="stat-row">
                <span>Settled</span>
                <a href={explorerTx(round.release.sig)} target="_blank" rel="noreferrer" style={{color:'#14F195'}}>
                  View tx ↗
                </a>
              </div>
            )}
          </div>
        )}

        <div className="sidebar-footer">
          <span>CoralOS · Solana devnet</span>
        </div>
      </aside>
    </div>
  )
}
