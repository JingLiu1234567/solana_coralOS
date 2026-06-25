# e2e

Playwright end-to-end tests for the **marketplace stack** (`web/` + `api-server`) — not the
CoralOS agent economy (that has its own checks: `scripts/smoke/` and `bridge/smoke.ts`).

## Run

```sh
npm install
npx playwright install      # once — browser binaries
npm test
```

## Tests

| Spec | Covers |
|------|--------|
| `tests/api.spec.ts` | `api-server` REST endpoints (`/api/v1/…`) |
| `tests/marketplace.ui.spec.ts` | the `web/` marketplace UI flow |

Start `api-server` (:8081) and `web` (:3000) before running, or wire them into
`playwright.config.ts`'s `webServer`. Devnet only.
