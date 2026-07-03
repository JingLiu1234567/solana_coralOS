#!/usr/bin/env node
// The no-`just` one-command TenderNet launcher for macOS/Linux (Windows: use `.\dev.ps1` instead,
// which additionally opens all 4 agent terminals automatically — Node can't reliably do that
// cross-platform, so here you still open them yourself; this script does everything else):
//
//   node scripts/demo.js          (or: npm run dev)
//
// docker up -> wallets -> feed + dashboard servers -> create the CoralOS session -> open the browser.
// Then: open 4 terminals, `cd coral-agents/<name> && claude`, type `go` in each.

import { spawnSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const feedDir = join(root, 'examples', 'marketplace', 'feed')
const webDir = join(root, 'examples', 'marketplace', 'web')
const url = 'http://localhost:5173'

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor < 20) {
  console.error(`[demo] Node ${process.version} detected — this kit needs Node 20+. Install it from nodejs.org, then re-run.`)
  process.exit(1)
}

function run(cmd, args, cwd = root) {
  console.log(`\n\x1b[36m$ ${cmd} ${args.join(' ')}\x1b[0m`)
  return spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true }).status === 0
}

// 1. Docker must be running — coral-server is a container.
if (!run('docker', ['version', '--format', '{{.Server.Version}}'])) {
  console.error('\n[demo] Docker is not running. Start Docker Desktop, then re-run `node scripts/demo.js`.')
  process.exit(1)
}

// 2. Devnet wallets (idempotent — re-reads if .env already has them).
run('npm', ['install', '--no-audit', '--no-fund'], join(root, 'scripts'))
run('node', ['scripts/setup.js'])

// 3. Start coral-server (the MCP coordinator).
run('docker', ['compose', 'up', '-d', 'coral'])

// 4. Feed + dashboard, in the background.
for (const dir of [feedDir, webDir]) {
  if (!existsSync(join(dir, 'node_modules'))) {
    console.log(`\n[demo] installing deps in ${dir} …`)
    spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, shell: true, stdio: 'inherit' })
  }
}
const feed = spawn('npm', ['start'], { cwd: feedDir, shell: true, stdio: 'inherit' })
const web = spawn('npm', ['run', 'dev'], { cwd: webDir, shell: true, stdio: 'inherit' })
const stop = () => { feed.kill(); web.kill(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

// 5. Create the TenderNet session (prints each agent's directory + the URL to open).
setTimeout(() => {
  console.log('\n[demo] Creating the TenderNet session…')
  run('bash', ['coral-agents/start-session.sh'])

  const [cmd, args] =
    platform() === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  spawn(cmd, args, { shell: true, stdio: 'ignore' })

  console.log(`\n[demo] Dashboard: ${url}`)
  console.log('[demo] Now open 4 terminals and start each persona (see the directories printed above):')
  console.log('[demo]   cd coral-agents/<name> && claude   — then type `go` in each.\n')
}, 3000)
