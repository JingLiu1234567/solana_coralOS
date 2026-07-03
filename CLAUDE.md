# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

**TenderNet** — a UK government procurement demo on Solana + CoralOS. A buyer agent publishes a tender
brief in a shared CoralOS thread; three competing consultancy agents bid, negotiate, and the buyer awards
best value. Funds settle through a real Solana escrow (Anchor) program on devnet. A live React dashboard
(SSE-fed) shows it all happening.

The critical thing that makes this different from a typical agent demo: **the buyer and the three
sellers are not scripted bots** — each is a real, independent Claude Code session (`claude` CLI), driven
by a `CLAUDE.md` persona prompt, connected to the shared CoralOS thread over MCP. The negotiation you see
in the dashboard (sellers challenging each other's pricing, the buyer pushing back with follow-up
questions) is genuine multi-agent LLM reasoning happening live across those 4 terminals, not a canned
script producing pre-written strings.

## Repo Layout

| Directory | Purpose |
|-----------|---------|
| `coral-agents/{buyer,whitehall-analytics,insight-research,stratford-advisory}/` | The four TenderNet personas. Each is `CLAUDE.md` (the persona/strategy/wire-format prompt) + `coral-agent.toml` (registers it with coral-server) + `startup.sh` (runs inside the coral container, writes `.coral-url`). The actual negotiating "brain" is the `claude` session you start in that directory — there is no compiled agent binary. |
| `coral-agents/coral-mcp-proxy.mjs` | The MCP proxy each agent's `.mcp.json` points `claude` at. |
| `coral-agents/start-session.sh` | macOS/Linux session-creation helper — creates the CoralOS session, prints each agent's directory to `cd` into and run `claude`. |
| `dev.ps1` | Windows one-command launcher — does everything `start-session.sh` does, plus writes `.mcp.json`/`settings.local.json` per agent and opens all 4 terminals + the dashboard automatically. |
| `examples/marketplace/feed/` | SSE feed server — polls coral-server's session state, folds the raw transcript into typed rounds (want/bids/award/deposit/delivered/release) via the wire-protocol parser. |
| `examples/marketplace/web/` | The React dashboard — Graph view (agent topology, live message ticker) and Chat view (full transcript), both reading the same feed. |
| `examples/agent-economy/escrow/` | The Anchor escrow contract (Rust) — deployed to devnet, the actual settlement spine `scripts/solana/{deposit,release}.mjs` operate against. `examples/agent-economy/config/coral.toml` is also still mounted by `docker-compose.yml` as coral-server's config. |
| `packages/agent-runtime/` | Shared TS package. `market/protocol.ts` (wire-format parse/format) is actively used by the feed server. `coral/`, `llm/` are also used by `examples/txodds/` (a separate, earlier demo track — see below). |
| `scripts/setup.js` | Generates devnet wallets, writes `.env`. |
| `scripts/solana/` | `deposit.mjs` / `release.mjs` / `balance.mjs` / `check-funded.mjs` — what the buyer's Claude Code session actually shells out to for escrow operations. |
| `.env` | Wallets + RPC only. **No LLM API key needed** — the agents run as your logged-in Claude Code sessions, not scripted processes calling an LLM API directly. |

`examples/agent-economy/` (beyond `escrow/` and `config/coral.toml`) and `examples/txodds/` are earlier /
alternate demo tracks from this kit's history (a generic Docker-agent marketplace, and a World Cup /
TxODDS oracle demo respectively) — they still typecheck in CI but are not part of the TenderNet flow.

## Commands

### Run the demo (requires Docker Desktop running + the `claude` CLI logged in)

```powershell
# Windows — one command:
.\dev.ps1
```

```sh
# macOS/Linux:
docker compose up -d coral
cd examples/marketplace/feed && npm install && npm start &
cd examples/marketplace/web && npm install && npm run dev &
bash coral-agents/start-session.sh   # then open 4 terminals, `cd coral-agents/<name> && claude`, type `go` in each
```

### Feed / dashboard only (typecheck + test)

```sh
cd examples/marketplace/feed && npm install && npm run typecheck && npm test
cd examples/marketplace/web && npm install && npm run typecheck && npm test
```

### packages/agent-runtime

```sh
cd packages/agent-runtime && npm install && npm run typecheck && npm test && npm run build
```

## Architecture

### The negotiation lifecycle

All four agents share one CoralOS thread. Wire-protocol messages (`packages/agent-runtime/src/market/protocol.ts`)
carry a `round` tag that is **constant for an entire tender** — from the first `WANT` through the final
`RELEASED` — regardless of how many negotiation exchanges or draft revisions happen inside it. Each
persona's `CLAUDE.md` spells out the exact literal wire format it must use (`WANT round=1 service=...`,
`BID round=1 price=... by=...`, etc.) because the feed's parser is strict and free-text messages don't
match it.

1. `buyer` publishes `WANT` → the 3 sellers bid and negotiate live in the same thread
2. `buyer` sends `AWARD` — from here the dashboard's Graph view drops the losing sellers and shows only
   buyer ↔ winner
3. `buyer` runs `scripts/solana/deposit.mjs`, sends `DEPOSITED`
4. winner submits a draft; `buyer` reviews, may request revisions, eventually sends `DRAFT_APPROVED`
5. winner sends `DELIVERED`; `buyer` runs `scripts/solana/release.mjs`, sends `RELEASED` — the escrow
   settlement, with a live Solana Explorer link

### Escrow contract (`examples/agent-economy/escrow`)

Anchor program, deployed to devnet. `initialize` (buyer deposits into a PDA seeded by `(buyer, reference)`),
`release` (buyer confirms delivery → pays seller), `refund` (buyer reclaims after a deadline). See its
`README.md`.

## Key Constraints

- **coral-server can hang** — it's been observed to stop answering any HTTP request after enough
  sessions get created in one run (port stays open, zero response). Fix: `docker compose restart coral`,
  then recreate the session. Not a code bug in this repo; a quirk of the pinned coral-server image.
- **`.mcp.json` / `.coral-url` are regenerated every run** — they're gitignored; don't hand-edit them,
  re-run the session-creation step instead.
- **Devnet only** — never put a funded mainnet keypair in `.env`.
- **The wire-protocol `round` tag is not the same as "negotiation round N"** — see above. This has
  bitten the dashboard before (a stray `round=2` on a mid-negotiation message created a phantom
  incomplete round that eclipsed the real, settled one).
