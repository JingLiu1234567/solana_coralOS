#!/usr/bin/env node
// Deposit SOL into escrow for an awarded contract.
// Usage: node scripts/solana/deposit.mjs --seller <pubkey> --amount <SOL> [--reference <pubkey>]
//
// If --reference is omitted, a new random reference keypair is generated and printed.
// Save the reference pubkey — you need it for release.mjs and check-funded.mjs.
import { buyerKeypair, makeProgram, escrowPda, SOL } from './_common.mjs'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }

const sellerArg = get('--seller')
const amountArg = parseFloat(get('--amount') || '0')
const refArg = get('--reference')

// No single default seller anymore — each persona has its own wallet (see WALLETS.txt),
// so the buyer must always pass the address of whichever seller actually won the AWARD.
if (!sellerArg) { console.error('ERROR: --seller <pubkey> required — use the wallet of the awarded seller (see WALLETS.txt)'); process.exit(1) }
if (!amountArg) { console.error('ERROR: --amount <SOL> required'); process.exit(1) }

const buyer = buyerKeypair()
const seller = new PublicKey(sellerArg)
const refKeypair = refArg ? { publicKey: new PublicKey(refArg) } : Keypair.generate()
const reference = refKeypair.publicKey
const deadlineSecs = 3600 // 1 hour

console.log(`Buyer:     ${buyer.publicKey.toBase58()}`)
console.log(`Seller:    ${seller.toBase58()}`)
console.log(`Reference: ${reference.toBase58()}`)
console.log(`Amount:    ${amountArg} SOL`)
console.log(`Escrow:    ${escrowPda(buyer.publicKey, reference).toBase58()}`)
console.log('Depositing...')

const program = makeProgram(buyer)
const txSig = await program.methods
  .initialize(new BN(Math.round(amountArg * SOL)), reference, new BN(Math.floor(Date.now() / 1000) + deadlineSecs))
  .accounts({ buyer: buyer.publicKey, seller, escrow: escrowPda(buyer.publicKey, reference), systemProgram: SystemProgram.programId })
  .signers([buyer])
  .rpc()

console.log(`✅ Deposited ${amountArg} SOL`)
console.log(`TX: https://explorer.solana.com/tx/${txSig}?cluster=devnet`)
console.log(`REFERENCE=${reference.toBase58()}`)
