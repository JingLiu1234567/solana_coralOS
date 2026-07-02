// The feed server's API contract (mirrors marketplace-feed's Round). Kept here so the browser bundle
// never imports the node-side runtime/anchor/web3 code.

export interface ProposalContent {
  executive_summary: string
  methodology: string
  ac_responses: Record<string, string>
  team_credentials: string
  social_value: string
  price_justification: string
  key_differentiator?: string
}

export interface RoundBid {
  by: string
  priceSol: number
  note?: string
  proposal?: ProposalContent
}

export type RoundStatus = 'bidding' | 'awarded' | 'deposited' | 'delivered' | 'settled' | 'refunded'

export interface Round {
  round: number
  want?: { service: string; arg: string; brief?: string; budgetSol: number }
  bids: RoundBid[]
  declined: string[]
  award?: { to: string; reason?: string }
  escrow?: { reference: string; seller: string; amountSol: number; deadlineSecs: number }
  deposit?: { sig: string; buyer: string }
  delivered?: { raw: string; data?: unknown }
  release?: { sig: string; score?: number }
  qualityFailed?: { score: number; reason: string }
  refunded?: boolean
  status: RoundStatus
}

export interface Feed {
  session: string
  rounds: Round[]
  updatedAt: string
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`
