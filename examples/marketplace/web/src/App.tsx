import { useState } from 'react'
import { useFeed, startMarket } from './api'
import { MarketView } from './components/MarketView'
import { Explainer } from './components/Explainer'
import { AgentGraph } from './components/AgentGraph'

/** Read ?session=<id> from the URL so the launcher can deep-link straight to a live market. */
const initialSession = new URLSearchParams(window.location.search).get('session') ?? ''

export default function App() {
  const [session, setSession] = useState(initialSession)
  const [starting, setStarting] = useState(false)
  const [startErr, setStartErr] = useState<string>()
  const { rounds, connected, error } = useFeed(session)

  async function onStart() {
    setStarting(true)
    setStartErr(undefined)
    try {
      const id = await startMarket()
      setSession(id)
      const url = new URL(window.location.href)
      url.searchParams.set('session', id)
      window.history.replaceState({}, '', url)
    } catch (e) {
      setStartErr((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="app">
      <header className="app-head">
        <h1>TenderNet</h1>
        <span className="sub">AI-powered government tendering · settled on Solana</span>
        <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} data-testid="conn" title={connected ? 'connected' : (error ?? 'disconnected')} />
      </header>

      <div className="session-bar">
        <input
          aria-label="session id"
          placeholder="paste a market session id…"
          value={session}
          onChange={(e) => setSession(e.target.value.trim())}
        />
        <button onClick={onStart} disabled={starting} data-testid="start">
          {starting ? 'starting…' : 'Launch a tender'}
        </button>
      </div>
      {startErr && <p className="start-err" data-testid="start-err">{startErr}</p>}

      {rounds.length === 0 && <Explainer />}

      <main>
        {!session && (
          <p className="empty">Click <strong>Launch a tender</strong> to begin.</p>
        )}
        {session && rounds.length === 0 && (
          <p className="empty" data-testid="empty">Waiting for the public authority to publish a tender…</p>
        )}
        {session && rounds.length > 0 && (
          <AgentGraph round={rounds[rounds.length - 1]} />
        )}
        {session && rounds.length > 1 && (
          <>
            <p className="ag-history-label">Previous rounds</p>
            <MarketView rounds={rounds.slice(0, -1)} />
          </>
        )}
      </main>
    </div>
  )
}
