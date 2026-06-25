# api-server

Express REST API that wraps the agent runtime (`@pay/agent-runtime`) over HTTP. Port **8081**.

This is the **secondary** server for the kit — it powers the `web/` marketplace via the typed
client `@pay/coral-client`. The core agent economy (`examples/agent-economy/`) talks to
**coral-server**, not to this; you only need `api-server` if you're building a browser/HTTP frontend
for agents.

## Run

```sh
npm install
npm run dev        # :8081 with hot reload
npm test           # unit tests
npm run typecheck
```

## Routes (`/api/v1/`)

| Route | What |
|-------|------|
| `/agents` | create / list / start / stop / remove agents; `POST /:id/handle` to feed a message |
| `/shared-state` | versioned key-value read/write |
| `/messages` | the message bus (send / poll) |
| `/weather` | a demo paid endpoint |

## How it fits

```
web/  ──@pay/coral-client──▶  api-server  ──imports──▶  @pay/agent-runtime
```

`registry.ts` maps strategy-name strings to factories — add an entry there to expose a new strategy
over HTTP. Devnet only.
