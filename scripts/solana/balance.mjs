#!/usr/bin/env node
// Usage: node scripts/solana/balance.mjs [pubkey]
// If no pubkey given, shows buyer balance from .env.
import { connection, buyerKeypair, env } from './_common.mjs'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

const addr = process.argv[2]
  ? new PublicKey(process.argv[2])
  : buyerKeypair().publicKey

const lamports = await connection.getBalance(addr)
console.log(`Address: ${addr.toBase58()}`)
console.log(`Balance: ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`)
