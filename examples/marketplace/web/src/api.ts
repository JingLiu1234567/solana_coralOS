import { useEffect, useRef, useState } from 'react'
import type { Feed, RawMessage, ClassifiedMessage } from './types'
import { classifyMessage } from './types'

const FEED_URL = import.meta.env.VITE_FEED_URL ?? 'http://localhost:4000'

export async function startMarket(): Promise<string> {
  const r = await fetch(`${FEED_URL}/api/start`, { method: 'POST' })
  const body = (await r.json()) as { session?: string; error?: string }
  if (!r.ok || !body.session) throw new Error(body.error ?? `start failed (${r.status})`)
  return body.session
}

export interface FeedState {
  rounds: Feed['rounds']
  connected: boolean
  error?: string
}

export function useFeed(session: string, intervalMs = 1000): FeedState {
  const [state, setState] = useState<FeedState>({ rounds: [], connected: false })
  const stop = useRef(false)

  useEffect(() => {
    stop.current = false
    if (!session) { setState({ rounds: [], connected: false, error: 'no session' }); return }
    const tick = async () => {
      try {
        const r = await fetch(`${FEED_URL}/api/feed?session=${encodeURIComponent(session)}`)
        if (!r.ok) throw new Error(`feed ${r.status}`)
        const feed = (await r.json()) as Feed
        if (!stop.current) setState({ rounds: feed.rounds ?? [], connected: true })
      } catch (e) {
        if (!stop.current) setState((s) => ({ ...s, connected: false, error: (e as Error).message }))
      }
    }
    void tick()
    const id = setInterval(tick, intervalMs)
    return () => { stop.current = true; clearInterval(id) }
  }, [session, intervalMs])

  return state
}

export interface MessagesState {
  messages: ClassifiedMessage[]
  connected: boolean
}

export function useMessages(session: string, intervalMs = 1500): MessagesState {
  const [state, setState] = useState<MessagesState>({ messages: [], connected: false })
  const stop = useRef(false)

  useEffect(() => {
    stop.current = false
    if (!session) { setState({ messages: [], connected: false }); return }
    const tick = async () => {
      try {
        const r = await fetch(`${FEED_URL}/api/messages?session=${encodeURIComponent(session)}`)
        if (!r.ok) throw new Error(`messages ${r.status}`)
        const body = (await r.json()) as { messages: RawMessage[] }
        const classified = (body.messages ?? []).map((m, i) => classifyMessage(m, i))
        if (!stop.current) setState({ messages: classified, connected: true })
      } catch {
        if (!stop.current) setState((s) => ({ ...s, connected: false }))
      }
    }
    void tick()
    const id = setInterval(tick, intervalMs)
    return () => { stop.current = true; clearInterval(id) }
  }, [session, intervalMs])

  return state
}
