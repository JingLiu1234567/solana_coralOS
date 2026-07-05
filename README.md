# TenderNet — AI Government Procurement on Solana

> **UK government tendering, reimagined with autonomous LLM agents and trustless Solana escrow.**
>
> Built for the [Imperial AI Agent Hackathon](https://superteam.fun/earn/listing/imperial-ai-agent-hackathon-build-the-agent-economy) · Superteam UK · July 2026

A buyer agent publishes a tender brief in a shared CoralOS thread. Three competing consultancy agents
read it, write full proposals, and bid. The buyer negotiates with all three live, picks best value, and
funds a Solana escrow. The winner delivers a research report; the buyer scores it against the original
brief and releases escrow on a passing score — all autonomously, all on-chain, all visible live in the
browser.

Each agent — buyer, Whitehall Analytics, Insight Research, Stratford Advisory — is a **real, independent
Claude Code session**, not a scripted bot. They coordinate over CoralOS (MCP) in one shared thread, so the
negotiation you see (sellers challenging each other's pricing, the buyer pushing back with follow-up
questions) is genuine multi-agent reasoning, not a canned script.

![TenderNet — live Chat / Graph view of the negotiation](docs/demo-chat-graph.gif)

---

## The three pillars

| Pillar | Role | Remove it → |
|--------|------|-------------|
| **LLM agents** | Sellers write competitive proposals; buyer negotiates, judges best value, and scores delivery quality | Static vending machine |
| **CoralOS** | Shared market thread — dynamic discovery, multi-agent coordination via MCP | Point-to-point pipes |
| **Solana escrow** | Funds locked until delivery verified; refundable if seller no-shows | Trust-me play money |

---

## Protocol flow

```
TENDER
  UK Govt Buyer  →  WANT · "Public attitudes towards AI adoption in UK public services"

  BIDS + NEGOTIATION (live, multi-round)
  ├─ Whitehall Analytics    BID · counters on price / scope
  ├─ Stratford Advisory     BID · counters on price / scope
  └─ Insight Research Ltd   BID · counters on price / scope

AWARD
  UK Govt Buyer   →  AWARD · → best-value bidder
  Solana Escrow   →  DEPOSITED · bid amount locked     ↗ tx

DELIVERY
  Winning seller  →  DELIVERED · Final research report    Score X/100 ✅ (passing bar)
  Solana Escrow   →  RELEASED · funds → winning seller    ↗ tx
```

*Bids, winner, and score above vary run to run — each agent is a live, independent LLM session, not a
scripted outcome. The GIF below is one real run.*

The buyer and sellers argue their case in the same CoralOS thread before the award — real back-and-forth,
not a single bid-and-done round. Every dashboard view (Graph / Chat) reads the same live transcript.

![TenderNet — escrow released, settlement confirmed on-chain](docs/demo-settlement.gif)

---

## What was built

This project extends the [solana_coralOS](https://github.com/trilltino/solana_coralOS) starter kit with a
complete UK government procurement use case, orchestrated by real Claude Code agent sessions rather than
scripted bots:

| Component | What's new |
|-----------|------------|
| **Four CLAUDE.md personas** | `coral-agents/{buyer,whitehall-analytics,insight-research,stratford-advisory}` — each a real Claude Code session with its own strategy, floor price, and communication loop |
| **`govreport` service** | The tender: a UK public policy research report — executive summary, methodology, findings, recommendations, evidence base |
| **Buyer-as-judge** | The buyer itself negotiates, awards, scores the delivered draft against the brief (0–100), and only releases escrow on a passing score |
| **Solana escrow settlement** | Deposit/release run against a real Anchor program on devnet — every settlement has a live Explorer link |
| **Dashboard (Graph + Chat views)** | Live SSE-fed React UI — a ChatDev-style agent graph (who's talking to whom, live message preview) and a full chat transcript, both reading the same feed |

---

## Quick start

### Prerequisites

| Need | Why | Get it |
|------|-----|--------|
| **Node 20+** | feed/web tooling + wallet scripts | [nodejs.org](https://nodejs.org) |
| **Docker Desktop** (running) | runs coral-server, the MCP coordinator | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Claude Code CLI**, logged in | the buyer + 3 seller personas each run as a `claude` session | [claude.com/code](https://claude.com/code) |

Devnet SOL is generated automatically — no wallet needed beforehand. The agents don't need an LLM API key
in `.env`; they run as your logged-in Claude Code sessions.

### 1. Clone and set up

```sh
git clone https://github.com/JingLiu1234567/solana_coralOS.git
cd solana_coralOS
node scripts/setup.js        # creates .env + two funded devnet wallets
```

Fund both printed wallet addresses at [faucet.solana.com](https://faucet.solana.com) (GitHub login
required; 1 SOL each is plenty).

### 2. Run

**Windows (PowerShell):**

```powershell
.\dev.ps1
```

One command: starts coral-server, the feed server, and the dashboard; creates a session; opens 4 agent
terminals wired up to it; opens the dashboard in its own window.

**macOS / Linux:**

```sh
node scripts/demo.js        # or: npm run dev
```

Starts coral-server, wallets, the feed + dashboard servers, and creates the session — everything
`dev.ps1` does except opening the 4 agent terminals (Node can't reliably do that cross-platform, so
you do this part yourself). Or run the steps by hand:

```sh
docker compose up -d coral                       # start coral-server
cd examples/marketplace/feed && npm install && npm start &   # feed server (:4000)
cd examples/marketplace/web && npm install && npm run dev &  # dashboard  (:5173)
bash coral-agents/start-session.sh               # creates the session, prints each agent's directory
```

Then open 4 terminals and start each persona:

```sh
cd coral-agents/buyer               && claude   # repeat for whitehall-analytics, insight-research, stratford-advisory
```

In each terminal, type `go`. Open `http://localhost:5173?session=<the session id start-session.sh printed>`.

### 3. Watch it live

Two dashboard views (toggle in the sidebar), both fed by the same live transcript:

- **Chat** — the full conversation: WANT, every bid and counter-argument, the award, escrow deposit,
  the delivered draft, the review score, and the final on-chain release — each tagged and readable.
- **Graph** — a live agent-topology view: buyer ↔ sellers while bidding, collapsing to buyer ↔ winner once
  awarded, with a live "latest message" panel and clickable Solana Explorer links for deposit/release in
  the sidebar once they happen.

---

## Architecture

### Agent roster (`coral-agents/`)

| Agent | Identity | Role |
|-------|----------|------|
| `buyer` | UK Govt Buyer | Publishes the tender, negotiates, awards, funds + releases escrow, scores the delivered draft |
| `whitehall-analytics` | Whitehall Analytics | Government data analytics consultancy — quality-first, mid floor |
| `insight-research` | Insight Research Ltd | Citizen-engagement consultancy — lowest floor, price-competitive |
| `stratford-advisory` | Stratford Advisory | Premium governance consultancy — highest floor, quality-over-price |

Each is a `CLAUDE.md` + `coral-agent.toml` + `startup.sh` — coral-server registers them and hands each a
CoralOS MCP connection URL; the actual negotiating "brain" is the live Claude Code session you start in
that directory.

### Escrow contract (`examples/agent-economy/escrow`)

Anchor/Rust program deployed on devnet. Three instructions:

| Instruction | Does |
|-------------|------|
| `initialize` | Buyer deposits SOL into a PDA seeded by `(buyer, reference)` |
| `release` | Buyer confirms delivery → pays the seller, closes the account, returns rent |
| `refund` | Buyer reclaims the deposit after a deadline if the seller no-shows |

`scripts/solana/{deposit,release}.mjs` are what the buyer session actually runs against this program.

### Dashboard (`examples/marketplace/{feed,web}`)

`feed` polls coral-server's session state and folds the raw transcript into typed rounds (want / bids /
award / deposit / delivered / release) using the wire-protocol parser in `packages/agent-runtime`; `web`
is the React dashboard (Graph + Chat views) that reads it.

---

## Repo layout

| Directory | Purpose |
|-----------|---------|
| `coral-agents/{buyer,whitehall-analytics,insight-research,stratford-advisory}/` | The four TenderNet personas — CLAUDE.md, coral-agent.toml, startup.sh |
| `coral-agents/coral-mcp-proxy.mjs` | MCP proxy each agent's `.mcp.json` points at |
| `examples/marketplace/feed/` | SSE feed server — folds the coral transcript into rounds |
| `examples/marketplace/web/` | React dashboard (Graph + Chat views) |
| `examples/agent-economy/escrow/` | Anchor escrow contract (the settlement spine) |
| `packages/agent-runtime/` | Shared wire-protocol parser used by the feed server |
| `scripts/setup.js` | Generates devnet wallets + `.env` |
| `scripts/solana/` | `deposit.mjs` / `release.mjs` / `balance.mjs` / `check-funded.mjs` — what the buyer session runs |
| `dev.ps1` | Windows one-command launcher |
| `coral-agents/start-session.sh` | macOS/Linux session-creation helper (see Quick start) |

`examples/agent-economy` (beyond `escrow/`) and `examples/txodds` are earlier/alternate demo tracks from
this kit's history and aren't part of the TenderNet flow above.

---

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — coral-server occasionally hangs and needs a
`docker compose restart coral`, wallet funding, and other rough edges are documented there.

---

## License

MIT
