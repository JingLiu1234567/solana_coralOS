# Troubleshooting

**First step, always:** run the readiness check — it diagnoses most of this and prints the fix.

```sh
just doctor          # or:  node scripts/doctor.js
```

---

## Setup & toolchain

### `node: command not found` (Windows, via `just`)
The justfile uses `cmd.exe` (`set windows-shell := ["cmd.exe", "/c"]`), which has the full PATH. If
you still hit it, reopen your terminal after installing Node, or run the manual README commands.

### `just` isn't installed
It's optional (`winget install Casey.Just`). Every recipe in the `justfile` is a one-liner you can copy,
or run `node scripts/demo.js` (macOS/Linux) / `.\dev.ps1` (Windows) directly.

### `Cannot find module '@solana/web3.js'` running setup/doctor
The `scripts/` deps aren't installed: `cd scripts && npm install`, then retry.

---

## Funding (the #1 hour-1 blocker)

### "Where are my wallet addresses?"
After `node scripts/setup.js` they're printed **and saved to `WALLETS.txt`**. Re-run it anytime to reprint.

### The faucet won't give me SOL / "rate limited"
[faucet.solana.com](https://faucet.solana.com) is the **only** way (CLI/RPC `airdrop` is gated). It
needs **GitHub sign-in** and rate-limits per account.
- Make sure you're signed in with GitHub.
- Request a small amount (1 SOL is plenty — a deposit is ~0.0008).
- Fund **both** the buyer and seller wallets; devnet SOL persists, so you only fund once.

### The buyer never deposits / `deposit.mjs` fails with "insufficient funds"
The buyer wallet is empty. `just doctor` checks both balances — fund the one it flags (`WALLETS.txt`).

---

## coral-server & sessions

### coral-server stops responding (port open, zero response to any request)
This has happened after enough sessions get created in one run — the container stays "Up" but every
HTTP request (even a plain `GET /`) times out with 0 bytes. Not a config issue; the pinned coral-server
image appears to hang under this condition. Fix:
```sh
docker compose restart coral
```
Then recreate the session (`.\dev.ps1` / `bash coral-agents/start-session.sh`) — you'll need to close
and reopen the 4 agent terminals too, since their `.mcp.json` pointed at the now-dead session.

### An agent's `claude` session never finishes connecting to the `coral` MCP server
Its `.mcp.json` is pointing at a session that no longer exists (coral-server restarted, or you're
looking at a stale terminal from an earlier run). `.mcp.json`/`.coral-url` are regenerated every time
you run the session-creation step — re-run it, close that agent's terminal, and reopen it so the MCP
server reconnects with the fresh URL (MCP servers only connect at `claude` process startup).

### Dashboard shows nothing / "Waiting for tender…" forever despite real activity in the logs
Two independent causes we've hit:
1. **Wrong session in the browser.** `dev.ps1`/`demo.js` mint a brand-new session every run and don't
   close previously-opened tabs. Check the URL bar matches the session id the 4 agent terminals are
   actually using (`grep CORAL_URL coral-agents/*/.mcp.json`).
2. **A stray wire-protocol tag.** Every message in `packages/agent-runtime/src/market/protocol.ts`'s
   format carries a `round=` tag that must stay constant for the *entire* tender (see each persona's
   `CLAUDE.md`). If an agent ever increments it mid-negotiation (confusing "round 2 of haggling" with
   the wire tag), the feed creates a second, empty round with no `WANT` — which can eclipse the real,
   settled one in the UI even though nothing is actually broken on-chain.

### Port `:5555` already in use
```sh
docker compose down
#   Windows:  netstat -ano | findstr :5555      macOS/Linux:  lsof -i :5555
```

---

## Escrow contract

### `escrow IDL not found on-chain` / a `scripts/solana/*.mjs` script fails
The default `PROGRAM_ID` (`R5NW…CeXet`, in `scripts/solana/_common.mjs`) is on **devnet** — make sure
`SOLANA_RPC_URL` points at devnet. If you redeployed your own program, run `anchor keys sync` and update
`PROGRAM_ID` in `scripts/solana/_common.mjs`.
Still failing on devnet with the default id? The shared demo deployment may have been removed — deploy
your own and repoint:
```sh
cd examples/agent-economy/escrow && anchor build && anchor deploy --provider.cluster devnet
anchor keys sync     # then update PROGRAM_ID in scripts/solana/_common.mjs
```

### `anchor build` fails (only if you fork the contract)
Needs the Solana + Anchor toolchain (Anchor **0.32.x**). On Windows, if `target/deploy/escrow.so` is
missing after a build, run `cd programs/escrow && cargo build-sbf`. The contract is opt-in; the demo
runs against the already-deployed program with no build.

---

## World Cup demo (`examples/txodds/`, a separate track)

Not part of the TenderNet flow above — a standalone earlier demo. `just mint` (or
`cd examples/txodds && npm run mint`) refreshes its short-lived TxLINE token if you're working in that
directory specifically.

---

## Still stuck?
Run `just doctor` and paste its output into an issue — it captures Node, Docker, wallet, and stack state.
