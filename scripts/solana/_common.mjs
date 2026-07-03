// Shared utilities: load .env, connect to RPC, load keypair, Anchor IDL.
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import * as anchor from '@coral-xyz/anchor'
import bs58 from 'bs58'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function loadEnv() {
  const env = { ...process.env }
  const envPath = join(ROOT, '.env')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

export const env = loadEnv()

export const RPC = env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
export const connection = new Connection(RPC, 'confirmed')

export const PROGRAM_ID = new PublicKey('R5NWNg9eRLWWQU81Xbzz5Du1k7jTDeeT92Ty6qCeXet')

export const IDL = {
  address: 'R5NWNg9eRLWWQU81Xbzz5Du1k7jTDeeT92Ty6qCeXet',
  version: '0.1.0', name: 'escrow',
  instructions: [
    { name: 'initialize',
      discriminator: [175,175,109,31,13,152,155,237],
      accounts: [
        { name: 'buyer', writable: true, signer: true },
        { name: 'seller', writable: false, signer: false },
        { name: 'escrow', writable: true, signer: false, pda: { seeds: [{ kind: 'const', value: [101,115,99,114,111,119] }, { kind: 'account', path: 'buyer' }, { kind: 'arg', path: 'reference' }] } },
        { name: 'systemProgram', writable: false, signer: false },
      ],
      args: [{ name: 'amount', type: 'u64' }, { name: 'reference', type: 'pubkey' }, { name: 'deadline', type: 'i64' }] },
    { name: 'release',
      discriminator: [253,249,15,206,28,127,193,241],
      accounts: [
        { name: 'buyer', writable: true, signer: true },
        { name: 'seller', writable: true, signer: false },
        { name: 'escrow', writable: true, signer: false },
      ],
      args: [] },
    { name: 'refund',
      discriminator: [2,96,183,251,63,208,46,46],
      accounts: [
        { name: 'buyer', writable: true, signer: true },
        { name: 'escrow', writable: true, signer: false },
      ],
      args: [] },
  ],
  accounts: [{ name: 'Escrow', discriminator: [31,213,123,187,186,22,218,155] }],
  types: [{ name: 'Escrow', type: { kind: 'struct', fields: [
    { name: 'buyer', type: 'pubkey' },
    { name: 'seller', type: 'pubkey' },
    { name: 'amount', type: 'u64' },
    { name: 'reference', type: 'pubkey' },
    { name: 'deadline', type: 'i64' },
    { name: 'bump', type: 'u8' },
  ]}}],
  errors: []
}

export function buyerKeypair() {
  const b58 = env.BUYER_KEYPAIR_B58
  if (!b58) throw new Error('BUYER_KEYPAIR_B58 not set in .env')
  return Keypair.fromSecretKey(bs58.decode(b58))
}

export function escrowPda(buyer, reference) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), buyer.toBuffer(), reference.toBuffer()],
    PROGRAM_ID,
  )[0]
}

export function makeProgram(keypair) {
  const wallet = new anchor.Wallet(keypair)
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  return new anchor.Program(IDL, provider)
}

export const SOL = LAMPORTS_PER_SOL
