# coral-agents

The four TenderNet personas. Each is a **real Claude Code session** (`claude` CLI), not a compiled
agent — the directory just gives coral-server something to register and gives `claude` a persona prompt
and an MCP connection to the shared market thread.

| Agent | Role |
|-------|------|
| `buyer` | UK Govt Buyer — publishes the tender, negotiates, awards, funds + releases escrow, scores the delivered draft |
| `whitehall-analytics` | Seller — government data analytics consultancy, quality-first, mid floor |
| `insight-research` | Seller — citizen-engagement consultancy, lowest floor, price-competitive |
| `stratford-advisory` | Seller — premium governance consultancy, highest floor, quality-over-price |

Each agent's directory holds:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | The persona prompt — identity, strategy, communication loop, and the exact wire-protocol format it must use (`WANT round=1 ...`, `BID round=1 ...`, etc.) |
| `coral-agent.toml` | Registers the persona with coral-server |
| `startup.sh` | Runs once inside the coral container when a session starts — writes `.coral-url` so the host can wire up `.mcp.json` |
| `.mcp.json` / `.coral-url` *(gitignored, regenerated every run)* | The live session's MCP connection URL for this agent |

`coral-mcp-proxy.mjs` (this directory) is the MCP proxy each agent's `.mcp.json` points `claude` at.
`start-session.sh` creates the CoralOS session (macOS/Linux — Windows' `dev.ps1` does this plus opens
the 4 terminals automatically).

Settlement runs against the Anchor escrow contract in `examples/agent-economy/escrow/`, via
`scripts/solana/{deposit,release}.mjs` — see the repo root `README.md` for the full run instructions.
