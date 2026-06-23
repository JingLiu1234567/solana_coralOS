# Infrastructure Provider Keys

Quick guide to getting the keys and services this project uses. All are free-tier or open source.

---

## 1. Helius (Solana RPC + WebSocket)

**What it's for:** Fast devnet RPC and WebSocket `accountSubscribe` for the Helius Monitor agent and Pay Demo.

**How to get a key:**

1. Sign up at [helius.dev](https://helius.dev)
2. Create a project
3. Copy your API key from the dashboard

**Free tier:** 100,000 credits/month — more than enough for development and demos.

**Add to `.env`:**
```sh
VITE_HELIUS_API_KEY=your-key-here
```

**What happens without it:** The app falls back to `https://api.devnet.solana.com` (public, rate-limited). Basic functionality works; WebSocket monitoring is slower.

---

## 2. Solana Devnet Wallet

**What it's for:** A funded wallet to test SOL transfers, Solana Pay URLs, and the Pay Demo.

**Option A — Solana CLI:**
```sh
solana-keygen new
solana config set --url devnet
solana airdrop 2   # get 2 devnet SOL for free
solana address     # copy your public key
```

**Option B — Browser (no install):**
1. Go to [faucet.solana.com](https://faucet.solana.com)
2. Paste any Solana address and request devnet SOL

**Option C — Phantom wallet:**
1. Install Phantom browser extension
2. Switch network to Devnet in settings
3. Use the built-in faucet or paste your address at [faucet.solana.com](https://faucet.solana.com)

**Use the address** as the recipient in the Pay Demo and Helius Monitor.

---

## 3. CoralOS (multi-agent Docker server)

**What it's for:** Running Python agents in isolated Docker containers with MCP tool protocol.

**How to start locally:**
```sh
docker pull coralprotocol/coral-server:latest
docker run -p 8001:8001 coralprotocol/coral-server:latest
```

**In the app:** Go to the CoralOS tab, set URL to `http://localhost:8001`, click Connect.

**No key required** — CoralOS is open source ([github.com/coralprotocol/coral](https://github.com/coralprotocol/coral)).

---

## 4. Pay.sh Demo Endpoint

**What it's for:** The `x402 Demo Payment` button and the Pay Demo's `complete_sale` call hit this endpoint to demonstrate a real 402 payment flow.

**URL:** `https://debugger.pay.sh/mpp/quote/AAPL`

**No key required** — it's a public demo endpoint.

---

## 5. Triton One (advanced — optional)

**What it's for:** High-performance Solana gRPC WebSocket via Yellowstone. Only needed for production-grade monitoring; the demo works fine with Helius.

**How to get access:**
1. Go to [triton.one](https://triton.one)
2. Request devnet access
3. Paste the `x-token` and gRPC endpoint into the agent's Triton config

---

## Summary

| Provider | Free tier | Required for |
|----------|-----------|-------------|
| [Helius](https://helius.dev) | 100k credits/month | Pay Demo, Helius Monitor |
| Solana devnet wallet | unlimited airdrops | Pay Demo, Solana Pay tab |
| CoralOS docker | self-hosted free | Python agent tab, CoralOS tab |
| Pay.sh | public endpoint | Demo Payment, Pay Demo |
| Triton One | optional | Production-grade monitoring |
