# Bridge — human → agent (Phantom checkout)

The **human front door** to the same agent economy. A person can't be an MCP agent, so this bridge
represents them: it injects their order into a CoralOS session **as the `user-proxy` agent** (the
puppet API), routed to the same `seller-agent` the autonomous buyer uses. The human pays the
seller's Solana Pay URL with Phantom; the seller verifies on-chain and delivers.

It also **self-serves** the checkout UI, so there's no separate frontend to run.

## Run

```sh
# prereq: docker compose up -d coral   (from repo root)
npm install
SELLER_WALLET=<devnet pubkey> npm start     # bridge on :3010, serves the UI
# open http://localhost:3010 with Phantom (Devnet)
```

(Via the root `docker compose up -d bridge`, the env comes from `.env` automatically.)

## Flow

```
Browser → POST /order { service }              → seller PAYMENT_REQUIRED (read from session state)
Phantom signs + sends the SOL transfer → sig
Browser → POST /order/:memo/paid { sig }       → seller verifies on-chain → DELIVERED
```

## Files

```
server.ts       puppet bridge (inject as user-proxy) + order endpoints; self-serves web/
web/index.html  framework-free Phantom checkout (web3 via CDN, one file)
smoke.ts        headless test — pays from the .env keypair in place of the Phantom click
```

## Why read replies from session state

The coral **puppet API is send-only** — there's no GET to read a thread. So the bridge reads the
seller's replies from `GET /api/v1/local/session/{ns}/{sid}/extended`, scoped to the order's
`threadId`. (See `.claude/AGENT_ECONOMY_RESTRUCTURE.md`.)

## Headless check

```sh
npm run smoke     # order → pay from keypair → assert DELIVERED  (needs coral up + a funded .env wallet)
```

Fork point: `server.ts` — what the seller delivers still comes from
`coral-agents/seller-agent/src/service.ts`.
