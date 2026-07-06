#!/usr/bin/env node
// Generates devnet wallets, writes .env, and saves the addresses to WALLETS.txt.
// Safe to re-run: existing wallets/keys are preserved; only what's missing is generated.
//
// Usage: node scripts/setup.js

import { Keypair } from '@solana/web3.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import bs58 from 'bs58'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')
const envPath = join(root, '.env')
const examplePath = join(root, '.env.example')
const walletsPath = join(root, 'WALLETS.txt')

/** Set or append `KEY=value` without disturbing the rest of the file. */
function setKv(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm')
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\s*$/, '\n')}${key}=${value}\n`
}
/** Read an existing assignment, or undefined. */
const getKv = (text, key) => text.match(new RegExp(`^${key}=(\\S+)`, 'm'))?.[1]
/** Drop a `KEY=...` line entirely (used to retire renamed keys). */
const dropKv = (text, key) => text.replace(new RegExp(`^${key}=.*\\n?`, 'm'), '')

// Base on an existing .env (preserve user-added keys); else the template.
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : readFileSync(examplePath, 'utf8')

// Each of the 3 seller personas gets its own receive wallet (was one shared `WALLET` — migrated
// into WALLET_WHITEHALL below so an already-funded address isn't wasted).
const SELLERS = [
  ['WALLET_WHITEHALL', 'Whitehall Analytics', getKv(env, 'WALLET')],
  ['WALLET_INSIGHT', 'Insight Research', undefined],
  ['WALLET_STRATFORD', 'Stratford Advisory', undefined],
]

// Generate only what's missing — re-running never rotates a key you've already funded.
const sellerPubkeys = SELLERS.map(([key, , legacy]) => [key, getKv(env, key) || legacy || Keypair.generate().publicKey.toBase58()])
let buyerB58 = getKv(env, 'BUYER_KEYPAIR_B58') || bs58.encode(Keypair.generate().secretKey)
const buyerPubkey = Keypair.fromSecretKey(bs58.decode(buyerB58)).publicKey.toBase58()

for (const [key, pubkey] of sellerPubkeys) env = setKv(env, key, pubkey)
env = dropKv(env, 'WALLET') // retired — replaced by the 3 per-seller vars above
env = setKv(env, 'BUYER_KEYPAIR_B58', buyerB58)
env = setKv(env, 'SOLANA_RPC_URL', getKv(env, 'SOLANA_RPC_URL') || 'https://api.devnet.solana.com')

writeFileSync(envPath, env)

// ── report ──
const block = [
  'TenderNet — devnet wallets',
  `Generated: ${new Date().toISOString()}`,
  '',
  ...SELLERS.map(([key, label], i) => `  Seller wallet  ${sellerPubkeys[i][1]}  (${label})`),
  `  Buyer  wallet  ${buyerPubkey}`,
  '',
  'FUND ALL 4 with devnet SOL — the only way is the web faucet',
  '(sign in with GitHub; CLI/RPC airdrops are gated):',
  '',
  '  https://faucet.solana.com',
  '',
].join('\n')
writeFileSync(walletsPath, block)
console.log('\n' + block)
console.log('(saved to WALLETS.txt · keys written to .env)')
console.log(`
Next: fund the wallet(s) above, then run the demo:

  Windows:        .\\dev.ps1
  macOS/Linux:    node scripts/demo.js   (or: npm run dev)
`)
