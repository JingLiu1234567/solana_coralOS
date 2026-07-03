/**
 * SettlementCelebration — a brief, unmissable moment for the two instants Solana actually does
 * something: escrow funded (deposit) and payment released. A coin burst + a bigger banner, both
 * self-dismissing, so the "proof" (a real signature + Explorer link) gets a beat of attention
 * instead of living only as a line of small text in the phase pill.
 */
import { useEffect, useRef, useState } from 'react'
import type { Round } from '../types'
import { explorerTx } from '../types'

const SOL_PURPLE = '#9945FF'
const SOL_GREEN = '#14F195'

interface Celebration {
  key: string
  kind: 'deposit' | 'release'
  sig: string
  amountSol?: number
  color: string
}

interface Coin {
  id: number
  dx: number
  dy: number
  rot: number
  delay: number
  drift: number
}

function makeCoins(count: number): Coin[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    dx: (Math.random() - 0.5) * 60,
    dy: -70 - Math.random() * 90,
    rot: (Math.random() - 0.5) * 300,
    delay: Math.random() * 0.2,
    drift: (Math.random() - 0.5) * 40,
  }))
}

export function SettlementCelebration({ round }: { round?: Round }) {
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [coins, setCoins] = useState<Coin[]>([])
  const seenSigs = useRef(new Set<string>())
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>()
  const clearTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const winningBid = round?.award && round.bids.find((b) => b.by === round.award!.to)
    const next: Celebration | null =
      round?.release && !seenSigs.current.has(round.release.sig)
        ? { key: `release-${round.release.sig}`, kind: 'release', sig: round.release.sig, amountSol: winningBid?.priceSol, color: SOL_GREEN }
        : round?.deposit && !seenSigs.current.has(round.deposit.sig)
        ? { key: `deposit-${round.deposit.sig}`, kind: 'deposit', sig: round.deposit.sig, amountSol: winningBid?.priceSol, color: SOL_PURPLE }
        : null
    if (!next) return

    seenSigs.current.add(next.sig)
    setCelebration(next)
    setCoins(makeCoins(16))

    clearTimeout(dismissTimer.current)
    clearTimeout(clearTimer.current)
    dismissTimer.current = setTimeout(() => setCelebration(null), 3200)
    clearTimer.current = setTimeout(() => setCoins([]), 1800)

    return () => {
      clearTimeout(dismissTimer.current)
      clearTimeout(clearTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.deposit?.sig, round?.release?.sig])

  if (!celebration) return null

  return (
    <div className="settle-celebration" role="status">
      {coins.length > 0 && (
        <div className="settle-coins">
          {coins.map((c) => (
            <span
              key={c.id}
              className="settle-coin"
              style={{
                '--dx': `${c.dx}px`,
                '--dy': `${c.dy}px`,
                '--drift': `${c.drift}px`,
                '--rot': `${c.rot}deg`,
                animationDelay: `${c.delay}s`,
              } as React.CSSProperties}
            >
              🪙
            </span>
          ))}
        </div>
      )}
      <a
        className="settle-banner"
        href={explorerTx(celebration.sig)}
        target="_blank"
        rel="noreferrer"
        style={{ '--settle-color': celebration.color } as React.CSSProperties}
      >
        <span className="settle-banner-icon">{celebration.kind === 'deposit' ? '🔒' : '💰'}</span>
        <span className="settle-banner-text">
          <strong>{celebration.kind === 'deposit' ? 'Escrow funded' : 'Payment released'}</strong>
          {celebration.amountSol != null && <> · {celebration.amountSol} SOL</>}
          <span className="settle-banner-sub"> — view on Solana Explorer ↗</span>
        </span>
      </a>
    </div>
  )
}
