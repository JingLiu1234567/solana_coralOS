# Contributing

Contributions are welcome. The `main` branch is the integration branch — target all PRs at `main`.

## Repo Layout

| Directory | Language | Typical changes |
|-----------|----------|-----------------|
| `coral-agents/{buyer,whitehall-analytics,insight-research,stratford-advisory}/` | `CLAUDE.md` prompts + TOML/shell | Persona strategy, floor prices, wire-protocol format instructions |
| `examples/marketplace/feed/` | TypeScript | SSE feed server — folds the coral transcript into typed rounds |
| `examples/marketplace/web/` | TypeScript/React | The dashboard (Graph + Chat views) |
| `packages/agent-runtime/` | TypeScript | Shared wire-protocol parser (`market/protocol.ts`) used by the feed server |
| `examples/agent-economy/escrow/` | Rust (Anchor) | The escrow settlement contract |
| `scripts/`, `scripts/solana/` | Node scripts | Wallet setup, deposit/release/balance helpers the buyer agent runs |

## Prerequisites

- Node.js 20+
- Docker Desktop (runs coral-server)
- The `claude` CLI, logged in (the 4 personas run as real Claude Code sessions — see `README.md` Quick
  start for how to launch them)

## Development Commands

```sh
# build the runtime first — the feed server depends on its dist via a file: dep
cd packages/agent-runtime && npm install && npm run build && npm run typecheck && npm test

# feed + dashboard
cd examples/marketplace/feed && npm install && npm run typecheck && npm test
cd examples/marketplace/web && npm install && npm run typecheck && npm test
```

Changing a persona's behavior means editing its `CLAUDE.md` (prompt), not TypeScript — there's no agent
binary to rebuild. If you change the wire-protocol format, keep it in sync across all four `CLAUDE.md`
files and `packages/agent-runtime/src/market/protocol.ts`'s parsers, or the dashboard will silently stop
folding those messages into rounds.

## PR Workflow

1. Open an issue or comment on an existing one to discuss your change.
2. Fork the repo and create a feature branch from `main`.
3. Make your change. Add tests for new behavior.
4. Run lint and typecheck locally before pushing.
5. Use [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.).
6. Open a PR against `main`.

## Code Style

- **TypeScript:** run `npm run typecheck && npm test` in the package(s) you changed before committing.
- **Documentation:** READMEs should explain *why* a module exists, not just *what* it does.

## Security

See [SECURITY.md](./SECURITY.md) for the security policy and vulnerability reporting process.
