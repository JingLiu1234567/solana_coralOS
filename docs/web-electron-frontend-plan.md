# Modular Frontend + Runtime Plan

## The Two Choices Students Make

```
CHOICE 1 — Frontend                    CHOICE 2 — Agent runtime
──────────────────────                 ────────────────────────
Tauri  (existing, unchanged)           Rust   (agent-core, existing)
Web    (to be built)                   TypeScript (agent-core-ts, to be built)
```

Both choices are independent. A student can run the Web frontend with Rust agents, the Tauri frontend with TypeScript agents, or any other combination. Everything talks to coral-server.

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (pick one)                                     │
│  ┌──────────────┐        ┌──────────────────────────┐   │
│  │ Tauri        │        │ Web  (localhost:5173)     │   │
│  │ src-tauri/   │        │ src-ui/ + transport.ts    │   │
│  └──────┬───────┘        └────────────┬─────────────┘   │
│         │ invoke()                    │ fetch()          │
└─────────┼─────────────────────────────┼─────────────────┘
          │                             │
          └──────────────┬──────────────┘
                         │
              ┌──────────▼──────────┐
              │   coral-server      │  ← shared HTTP backend
              │   :8080             │     for state, messages,
              └──────────┬──────────┘     workflows
                         │
          ┌──────────────┼──────────────┐
          │                             │
┌─────────▼───────────┐   ┌────────────▼────────────┐
│ Rust runtime        │   │ TypeScript runtime        │
│ agent-core/         │   │ packages/agent-core-ts/   │
│                     │   │                           │
│ RpcPollStrategy     │   │ RpcPollStrategy (TS)      │
│ TransferStrategy    │   │ TransferStrategy (TS)     │
│ PaymentStrategy     │   │ PaymentStrategy (TS)      │
│ TritonMonitor       │   │ HeliusMonitorStrategy(TS) │
│ IdleStrategy        │   │ IdleStrategy (TS)         │
└─────────────────────┘   └───────────────────────────┘
```

Both runtimes sync state through coral-server — a Rust agent and a TypeScript agent can message each other, share state, and participate in the same workflow.

---

## Identical Concepts, Two Languages

Every concept in agent-core has a direct TypeScript equivalent. Students learn one mental model and apply it in either language.

| Concept | Rust (agent-core) | TypeScript (agent-core-ts) |
|---------|-------------------|---------------------------|
| Agent behaviour | `impl Strategy for MyStrategy` | `class MyStrategy implements Strategy` |
| Agent state | `AgentState` struct | `AgentState` interface |
| Action log | `Vec<AgentAction>` | `AgentAction[]` |
| Runtime | `AgentManager` | `AgentManager` class |
| Messaging | `MessageBus` | `MessageBus` class |
| Key-value store | `SharedState` | `SharedState` class |
| Workflows | `WorkflowEngine` | `WorkflowEngine` class |
| Roles | `AgentRole` enum | `AgentRole` enum |

**Rust strategy (what exists today):**
```rust
pub struct PriceMonitorStrategy { wallet: String }

#[async_trait]
impl Strategy for PriceMonitorStrategy {
    fn name(&self) -> &'static str { "price-monitor" }
    async fn run(&self, state: Arc<Mutex<AgentState>>) {
        let conn = RpcClient::new(state.lock().unwrap().rpc_endpoint.clone());
        // watch wallet, record actions...
    }
}
```

**Identical TypeScript strategy (what students write):**
```typescript
class PriceMonitorStrategy implements Strategy {
  name = "price-monitor"

  async run(state: AgentState, signal: AbortSignal): Promise<void> {
    const conn = new Connection(state.rpcEndpoint)
    conn.onAccountChange(new PublicKey(this.wallet), (info) => {
      state.recordAction("payment-received", `${info.lamports / 1e9} SOL`)
    })
    await untilAborted(signal)
  }
}

const manager = new AgentManager()
await manager.createAgent("my-agent", new PriceMonitorStrategy("7xK..."))
await manager.startAgent("my-agent")
```

Same concepts. Students who know TypeScript are productive immediately. Students who know Rust use the existing agent-core.

---

## Solana Primitives: npm Equivalents

The Rust Solana dependencies have direct npm equivalents — no capability loss.

| Rust crate | npm package | Used for |
|------------|-------------|---------|
| `solana_client::RpcClient` | `@solana/web3.js` `Connection` | RPC calls, balance reads |
| `solana_client::PubsubClient` | `@solana/web3.js` `onAccountChange` | WebSocket account subscription |
| `solana_pay` URL encoding | `@solana/pay` `encodeURL` | `solana:` URL generation |
| `solana_pay` URL parsing | `@solana/pay` `parseURL` | Payment request parsing |
| `helius.rs` REST calls | `@helius-labs/sdk` | Wallet monitoring, tx parsing |

---

## What Gets Built

### packages/agent-core-ts/

New directory. Self-contained TypeScript package, no dependency on agent-core Rust.

```
packages/agent-core-ts/
  src/
    types.ts          ← AgentState, AgentAction, AgentMessage, etc. — mirrors Rust structs exactly
    strategy.ts       ← Strategy interface + AbortSignal-based run loop
    agent.ts          ← Agent class (holds strategy, manages run task)
    manager.ts        ← AgentManager — create/start/stop/list agents
    message_bus.ts    ← MessageBus — broadcast + direct, 1000-msg ring buffer
    shared_state.ts   ← SharedState — versioned KV, change history
    role.ts           ← AgentRole enum + RolePermissions — identical to Rust
    workflow.ts       ← WorkflowEngine — DAG steps, status transitions
    strategies/
      rpc_poll.ts     ← RpcPollStrategy  (uses @solana/web3.js getSlot)
      idle.ts         ← IdleStrategy     (1Hz loop)
      transfer.ts     ← TransferStrategy (uses @solana/pay encodeURL)
      payment.ts      ← PaymentStrategy  (fetch + 402 parsing)
      helius_monitor.ts ← HeliusMonitorStrategy (uses @solana/web3.js onAccountChange)
    sync.ts           ← CoralServerSync — optional bridge to coral-server for cross-runtime messaging
    index.ts          ← barrel export
  package.json
  tsconfig.json
```

### packages/sdk/

Thin HTTP client for calling coral-server from any TypeScript project — frontend, Node.js, or within agent-core-ts itself.

```
packages/sdk/
  src/
    client.ts         ← CoralClient class — typed fetch() wrappers for every endpoint
    types.ts          ← shared types (imported from agent-core-ts)
  package.json
```

```typescript
// what students use in their own project
import { CoralClient } from "@pay/sdk"

const client = new CoralClient("http://localhost:8080")
await client.createAgent("buyer")
await client.sendMessage({ from: "buyer", to: "seller", type: "bid", payload: "0.001" })
const state = await client.getAgent("buyer")
```

### CoralServerSync (cross-runtime messaging)

The bridge that lets Rust and TypeScript agents message each other. TypeScript agents optionally register with coral-server so they appear in the UI and can exchange messages with Rust agents.

```typescript
// agent-core-ts/src/sync.ts
class CoralServerSync {
  // Registers the local TS AgentManager with coral-server.
  // Polls for inbound messages and forwards to local agents.
  // Pushes local agent actions and state to coral-server.
  async attach(manager: AgentManager, coralUrl: string): Promise<void>
}
```

With sync enabled, a TypeScript buyer agent and a Rust seller agent can complete a full payment handshake — same as two Rust agents.

---

## What Stays the Same

- `agent-core/` — untouched. Rust students use it directly.
- `coral-server/` — untouched. Both runtimes talk to it.
- `src-ui/` — untouched. The UI shows agents from both runtimes (they're all just JSON over HTTP).
- `src-tauri/` — untouched.
- Python agents — untouched.

---

## Student Experience by Language

### TypeScript / JavaScript student
```sh
cd packages/agent-core-ts && npm install
# write MyStrategy extends Strategy in TypeScript
# run with ts-node or compile to JS
```
Full agent runtime. No Rust required.

### Rust student
```sh
cd agent_demo && cargo build
# impl Strategy for MyStrategy in Rust
# cargo run
```
Full agent runtime. No Node required.

### Frontend-only student
```sh
npm install @pay/sdk
# call coral-server from React, Next.js, or Node
# don't write any agents — just orchestrate existing ones
```

### Python / CoralOS student
```sh
docker run coralprotocol/coral-server
# write a coral_agent.py with MCP tools
# coral launches it in a Docker container
```

All four entry points talk to the same coral-server backend and appear in the same UI.

---

## Frontend Plan (unchanged)

### Web frontend (to be built)

```sh
cd coral-server && cargo run
cd agent_demo/src-ui && npm run dev   →  http://localhost:5173
```

**What gets built:**
- `src-ui/src/transport.ts` — runtime switch: `invoke()` (Tauri) vs `fetch()` (web)
- `vite.config.ts` — add `VITE_API_URL` env var (default `http://localhost:8080`)
- `App.tsx` — replace `invoke()` calls with transport functions; Python tab gets web-mode notice
- coral-server extensions — ~20 missing endpoints (roles, CoralOS proxy, Solana Pay, pay-demo)

### Tauri (existing, unchanged)

```sh
cd agent_demo/src-tauri && cargo tauri dev
```

---

## Deep Scan: Accurate Status

### agent-core (Rust)

| Module | Status | Notes |
|--------|--------|-------|
| `agent.rs` | ✅ Done | Lifecycle, start/stop, action log |
| `manager.rs` | ✅ Done | Full CRUD, roles, messaging, state, workflows |
| `strategy.rs` | ✅ Done | `RpcPollStrategy`, `IdleStrategy` |
| `message_bus.rs` | ✅ Done | 1000-msg ring buffer, broadcast + direct |
| `shared_state.rs` | ✅ Done | Versioned KV, 500-entry history |
| `role.rs` | ✅ Done | 6 roles × 8 permission flags |
| `orchestrator/` | ✅ Done | DAG storage + manual step transitions |
| `solana_pay/url.rs` | ✅ Done | `solana:` URL encode/parse |
| `solana_pay/payment.rs` | ✅ Done | MPP + x402 challenge parse, demo flow |
| `solana_pay/strategies.rs` | ✅ Done | `TransferStrategy`, `PaymentStrategy` |
| `solana_pay/monitor.rs` | ✅ Done | WebSocket monitor, backoff retry |
| `solana_pay/validation.rs` | ✅ Fixed | Amount, sender, timestamp now populated |
| `helius.rs` | ✅ Done | REST client for wallet monitoring, tx parsing |
| `triton.rs` | ✅ Done | `TritonConfig` factory |
| `jito.rs` | ✅ Deleted | Removed — was unused stub |

### Tauri backend

| Item | Status |
|------|--------|
| 40+ IPC commands | ✅ Done |
| `set_agent_helius` | ✅ Fixed — added to main.rs |
| `create_helius_monitor_agent` | ✅ Fixed — added to main.rs |

### Python agents

| File | Status |
|------|--------|
| `helius_monitor/agent.py` standalone | ✅ Done |
| `helius_monitor/coral_agent.py` MCP | ✅ Done |
| `user_proxy/agent.py` | ✅ Done |

---

## Full File Inventory

### New files to create

| File | What it is |
|------|------------|
| `packages/agent-core-ts/src/types.ts` | Mirror of all Rust structs as TS interfaces |
| `packages/agent-core-ts/src/strategy.ts` | `Strategy` interface |
| `packages/agent-core-ts/src/agent.ts` | `Agent` class |
| `packages/agent-core-ts/src/manager.ts` | `AgentManager` class |
| `packages/agent-core-ts/src/message_bus.ts` | `MessageBus` class |
| `packages/agent-core-ts/src/shared_state.ts` | `SharedState` class |
| `packages/agent-core-ts/src/role.ts` | `AgentRole` enum + permissions |
| `packages/agent-core-ts/src/workflow.ts` | `WorkflowEngine` class |
| `packages/agent-core-ts/src/strategies/rpc_poll.ts` | `RpcPollStrategy` |
| `packages/agent-core-ts/src/strategies/idle.ts` | `IdleStrategy` |
| `packages/agent-core-ts/src/strategies/transfer.ts` | `TransferStrategy` |
| `packages/agent-core-ts/src/strategies/payment.ts` | `PaymentStrategy` |
| `packages/agent-core-ts/src/strategies/helius_monitor.ts` | `HeliusMonitorStrategy` |
| `packages/agent-core-ts/src/sync.ts` | `CoralServerSync` bridge |
| `packages/agent-core-ts/src/index.ts` | Barrel export |
| `packages/agent-core-ts/package.json` | Package config |
| `packages/agent-core-ts/tsconfig.json` | TS config |
| `packages/sdk/src/client.ts` | `CoralClient` HTTP wrapper |
| `packages/sdk/src/types.ts` | Re-exported types |
| `packages/sdk/package.json` | Package config |
| `agent_demo/src-ui/src/transport.ts` | Frontend runtime switch |
| `coral-server/src/api/coralos.rs` | CoralOS proxy endpoints |
| `coral-server/src/api/solana_pay.rs` | Solana Pay + x402 endpoints |
| `coral-server/src/api/pay_demo.rs` | Payment flows endpoints |
| `.env.example` | All env vars documented |
| `docs/provider-keys.md` | Helius, devnet wallet, CoralOS, Triton setup |
| `ref/README.md` | Read-only notice |

### Files to modify

| File | Change |
|------|--------|
| `agent_demo/src-ui/vite.config.ts` | Add `VITE_API_URL` env define |
| `agent_demo/src-ui/src/App.tsx` | Replace `invoke()` with transport; Python tab guard; move hardcoded Helius key to env |
| `coral-server/src/api/agents.rs` | Add role/meta/capabilities/typed-create routes |
| `coral-server/src/api/messaging.rs` | Add `GET /` all-messages |
| `coral-server/src/api/workflows.rs` | Add `/active` and `/agent/:id` |
| `coral-server/src/api/mod.rs` | Re-export new modules |
| `coral-server/src/main.rs` | Register new routes; add CoralOS client to AppState |
| `README.md` | Web quickstart first; Tauri secondary; all four student entry points |
| `DEMO.md` | Remove "still being built" section |

---

## Infrastructure Provider Keys

### Helius
[helius.dev](https://helius.dev) → sign up → copy API key → `.env`: `VITE_HELIUS_API_KEY=...`
Free tier: 100k credits/month.

### Solana devnet wallet
```sh
solana-keygen new && solana config set --url devnet && solana airdrop 2
```
Or [faucet.solana.com](https://faucet.solana.com) in browser.

### CoralOS
```sh
docker run -p 8001:8001 coralprotocol/coral-server:latest
```
Set CoralOS URL in the app to `http://localhost:8001`. No key required.

### Triton One
[triton.one](https://triton.one) → request devnet access → paste x-token into agent config. Optional — only needed for high-performance WebSocket monitoring.

### Pay.sh
No key needed — `https://debugger.pay.sh/mpp/quote/AAPL` is a public demo endpoint.
