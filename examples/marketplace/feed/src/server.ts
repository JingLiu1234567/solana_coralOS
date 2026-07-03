/**
 * Marketplace feed server.
 *
 * Instead of polling coral's /extended (which blocks when idle), this server maintains a
 * PERSISTENT SSE connection to coral per session. Each SSE event from coral is the full
 * extended state; we cache the latest one. Frontend polls us, we serve from cache.
 *
 *   POST /api/start              → { session }
 *   GET  /api/feed?session=<id>  → { session, rounds, updatedAt }
 *   GET  /api/messages?session=  → { session, messages, updatedAt }
 */
import express from 'express'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { foldRounds } from './foldRounds.js'
import { collectMessages, type RawMessage } from './coralState.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..') // solana_coralOS root

const BASE = process.env.CORAL_SERVER_URL ?? 'http://localhost:5555'
const TOKEN = process.env.CORAL_TOKEN ?? 'dev'
const NS = 'tendernet'
const PORT = Number(process.env.PORT ?? 4000)
const DEFAULT_SESSION = process.env.SESSION ?? ''
const FIXTURE = process.env.FEED_FIXTURE
const SELLERS = (process.env.MARKET_SELLERS ?? 'whitehall-analytics,insight-research,stratford-advisory')
  .split(',').map((s) => s.trim()).filter(Boolean)

// ── Per-session state cache ──────────────────────────────────────────────────

interface SessionCache {
  messages: RawMessage[]
  rawState: unknown
  updatedAt: Date
  watching: boolean
}
const cache = new Map<string, SessionCache>()

/**
 * Poll coral's /extended endpoint and keep cache up-to-date.
 *
 * This used to assume /extended was a persistent SSE stream (events framed as
 * "data: {...}\n\n"). The deployed coral-server image instead answers with a single
 * plain `application/json` body per request (confirmed: it 406s on
 * `Accept: text/event-stream`), so the SSE framing never matched and every
 * response was silently dropped. Polling the plain JSON directly instead.
 */
async function watchSession(session: string) {
  if (cache.has(session) && cache.get(session)!.watching) return
  const entry: SessionCache = { messages: [], rawState: null, updatedAt: new Date(), watching: true }
  cache.set(session, entry)
  console.error(`[feed] watching session ${session}`)

  const loop = async () => {
    while (entry.watching) {
      try {
        const r = await fetch(`${BASE}/api/v1/local/session/${NS}/${session}/extended`, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        })
        if (!r.ok) {
          await delay(2000)
          continue
        }
        const state = await r.json()
        const newMessages = collectMessages(state)
        if (newMessages.length !== entry.messages.length) {
          console.error(`[feed] ${session.slice(0,8)} — ${newMessages.length} messages`)
        }
        entry.rawState = state
        entry.messages = newMessages
        entry.updatedAt = new Date()
      } catch (e) {
        console.error(`[feed] /extended error: ${(e as Error).message} — retry in 2s`)
      }
      await delay(2000)
    }
  }

  loop().catch(console.error)
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Express app ─────────────────────────────────────────────────────────────

const app = express()
app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next() })
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/start', async (_req, res) => {
  try {
    const r = await fetch(`${BASE}/api/v1/local/session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentGraphRequest: {
          agents: [
            { id: { name: 'buyer', version: '0.1.0', registrySourceId: { type: 'local' } }, name: 'buyer', provider: { type: 'local', runtime: 'executable' }, blocking: false, options: {} },
            { id: { name: 'whitehall-analytics', version: '0.1.0', registrySourceId: { type: 'local' } }, name: 'whitehall-analytics', provider: { type: 'local', runtime: 'executable' }, blocking: false, options: {} },
            { id: { name: 'insight-research', version: '0.1.0', registrySourceId: { type: 'local' } }, name: 'insight-research', provider: { type: 'local', runtime: 'executable' }, blocking: false, options: {} },
            { id: { name: 'stratford-advisory', version: '0.1.0', registrySourceId: { type: 'local' } }, name: 'stratford-advisory', provider: { type: 'local', runtime: 'executable' }, blocking: false, options: {} },
          ],
          groups: [['buyer', 'whitehall-analytics', 'insight-research', 'stratford-advisory']],
        },
        namespaceProvider: { type: 'create_if_not_exists', namespaceRequest: { name: NS } },
        execution: { mode: 'immediate', runtimeSettings: { ttl: 86400000 } },
      }),
    })
    const data = (await r.json()) as Record<string, unknown>
    if (!r.ok) return res.status(502).json({ error: `coral ${r.status}`, details: data })
    const session = data.sessionId as string
    if (!session) return res.status(502).json({ error: 'no sessionId in response', details: data })
    watchSession(session)  // start persistent SSE watcher in background
    res.json({ session })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

function getCache(session: string): SessionCache | null {
  if (FIXTURE) {
    const state = JSON.parse(readFileSync(FIXTURE, 'utf8'))
    return { messages: collectMessages(state), rawState: state, updatedAt: new Date(), watching: false }
  }
  const entry = cache.get(session)
  if (!entry) {
    watchSession(session)  // auto-attach watcher if missing (e.g. server restarted)
    return null
  }
  return entry
}

app.get('/api/feed', (req, res) => {
  const session = FIXTURE ? 'fixture' : ((req.query.session as string) || DEFAULT_SESSION)
  if (!FIXTURE && !session) return res.status(400).json({ error: 'no session' })
  const entry = getCache(session)
  if (!entry) return res.json({ session, rounds: [], updatedAt: new Date().toISOString(), waiting: true })
  try {
    const rounds = foldRounds(entry.messages, SELLERS)
    res.json({ session, rounds, updatedAt: entry.updatedAt.toISOString() })
  } catch (e) {
    res.status(502).json({ error: `feed failed: ${(e as Error).message}` })
  }
})

app.get('/api/messages', (req, res) => {
  const session = FIXTURE ? 'fixture' : ((req.query.session as string) || DEFAULT_SESSION)
  if (!FIXTURE && !session) return res.status(400).json({ error: 'no session' })
  const entry = getCache(session)
  if (!entry) return res.json({ session, messages: [], updatedAt: new Date().toISOString(), waiting: true })
  res.json({ session, messages: entry.messages, updatedAt: entry.updatedAt.toISOString() })
})

app.listen(PORT, () => console.error(`[feed] http://localhost:${PORT}  session-watcher mode  (coral=${BASE})`))

// If DEFAULT_SESSION is set, watch it immediately on startup
if (DEFAULT_SESSION) watchSession(DEFAULT_SESSION)
