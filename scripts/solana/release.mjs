#!/usr/bin/env node
// Buyer releases escrow payment to seller after delivery is confirmed.
// Usage: node scripts/solana/release.mjs --seller <pubkey> --reference <pubkey>
import { buyerKeypair, makeProgram, escrowPda } from './_common.mjs'
import { PublicKey } from '@solana/web3.js'

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }

const sellerArg = get('--seller')
const refArg = get('--reference')

// No single default seller anymore — each persona has its own wallet (see WALLETS.txt),
// so the buyer must always pass the address of whichever seller actually won the AWARD.
if (!sellerArg) { console.error('ERROR: --seller <pubkey> required — use the wallet of the awarded seller (see WALLETS.txt)'); process.exit(1) }
if (!refArg) { console.error('ERROR: --reference <pubkey> required'); process.exit(1) }

const buyer = buyerKeypair()
const seller = new PublicKey(sellerArg)
const reference = new PublicKey(refArg)
const pda = escrowPda(buyer.publicKey, reference)

console.log(`Releasing escrow ${pda.toBase58()} → ${seller.toBase58()}`)

const program = makeProgram(buyer)
const txSig = await program.methods
  .release()
  .accounts({ buyer: buyer.publicKey, seller, escrow: pda })
  .signers([buyer])
  .rpc()

console.log(`✅ Payment released`)
console.log(`TX: https://explorer.solana.com/tx/${txSig}?cluster=devnet`)
