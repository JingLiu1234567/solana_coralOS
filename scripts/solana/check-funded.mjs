#!/usr/bin/env node
// Seller calls this to verify escrow is funded before delivering.
// Usage: node scripts/solana/check-funded.mjs --reference <pubkey> [--buyer <pubkey>] [--min <SOL>]
import { connection, buyerKeypair, makeProgram, escrowPda, env, SOL, PROGRAM_ID } from './_common.mjs'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }

const refArg = get('--reference')
const buyerArg = get('--buyer')
const minSol = parseFloat(get('--min') || '0')

if (!refArg) { console.error('ERROR: --reference <pubkey> required'); process.exit(1) }

const reference = new PublicKey(refArg)
const buyer = buyerArg ? new PublicKey(buyerArg) : buyerKeypair().publicKey
const pda = escrowPda(buyer, reference)

const program = makeProgram(buyerKeypair())
const acct = await program.account.escrow.fetchNullable(pda)

if (!acct) {
  console.log(`FUNDED=false`)
  console.log(`Escrow PDA ${pda.toBase58()} does not exist`)
  process.exit(1)
}

const amountSol = acct.amount.toNumber() / LAMPORTS_PER_SOL
const ok = minSol === 0 || acct.amount.toNumber() >= Math.round(minSol * SOL)
console.log(`FUNDED=${ok}`)
console.log(`Escrow:  ${pda.toBase58()}`)
console.log(`Buyer:   ${acct.buyer.toBase58()}`)
console.log(`Seller:  ${acct.seller.toBase58()}`)
console.log(`Amount:  ${amountSol.toFixed(6)} SOL`)
console.log(`Deadline: ${new Date(acct.deadline.toNumber() * 1000).toISOString()}`)
