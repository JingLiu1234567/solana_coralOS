# TenderNet dev tasks — macOS/Linux (Windows: use `.\dev.ps1`, which also opens the 4 agent
# terminals automatically). `just dev` = wallets + coral up + dashboard + create the session; you
# still open 4 terminals yourself afterwards (`cd coral-agents/<name> && claude`, type `go`).
#
# Needs: Docker Desktop running, Node 20+, the `claude` CLI logged in, and `just`
# (https://github.com/casey/just): cargo install just | brew install just | winget install Casey.Just
# No `just`? `node scripts/demo.js` (= `npm run dev`) does the same thing.

# On Windows, use cmd (full system PATH; supports && and cd like sh).
set windows-shell := ["cmd.exe", "/c"]

# default: list the recipes
default:
    @just --list

# one-shot: wallets + coral up + dashboard, then creates the session and prints next steps
dev: setup up
    node scripts/demo.js

# generate the devnet wallets (fund them manually at the faucet)
setup:
    cd scripts && npm install --no-audit --no-fund
    node scripts/setup.js

# start coral-server (MCP coordinator)
up:
    docker compose up -d coral

# creates the TenderNet session, prints each agent's directory to open a terminal in
session:
    bash coral-agents/start-session.sh

# the dashboard: feed server + UI on :5173, opens the browser
dashboard:
    node scripts/dashboard.js

# just the feed server (logs-flow alternative; reads coral's transcript)
feed:
    cd examples/marketplace/feed && npm install --no-audit --no-fund && npm start

# mint a fresh TxLINE free-tier token into .env — only needed for the separate examples/txodds demo
mint:
    cd examples/txodds && npm install --no-audit --no-fund && npm run mint

# readiness check: Docker, Node, wallets funded, coral up
doctor:
    cd scripts && npm install --no-audit --no-fund
    node scripts/doctor.js

# remove orphaned coral-spawned agent containers (also runs at the start of `just dev`)
clean:
    node scripts/clean.js

# tail coral-server logs
logs:
    docker compose logs -f coral

# stop everything
down:
    docker compose down
