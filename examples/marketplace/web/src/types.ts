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

export type RoundStatus = 'bidding' | 'awarded' | 'deposited' | 'reviewing' | 'delivered' | 'settled' | 'refunded'

export interface DraftRevision {
  round: number
  text: string
  feedback?: { score: number; text: string; decision: 'REVISE' | 'APPROVED' }
}

export interface Round {
  round: number
  want?: { service: string; arg: string; brief?: string; budgetSol: number }
  bids: RoundBid[]
  declined: string[]
  award?: { to: string; reason?: string }
  escrow?: { reference: string; seller: string; amountSol: number; deadlineSecs: number }
  deposit?: { sig: string; buyer: string }
  drafts?: DraftRevision[]
  draftApproved?: { finalScore: number }
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

// Raw coral thread message (for Chat view)
export type MessageType =
  | 'want' | 'bid' | 'award' | 'escrow-funded'
  | 'draft' | 'review' | 'approved'
  | 'delivered' | 'released' | 'message'

export interface RawMessage {
  sender: string
  text: string
}

export interface ClassifiedMessage extends RawMessage {
  type: MessageType
  index: number
}

export function classifyMessage(m: RawMessage, index: number): ClassifiedMessage {
  const t = m.text.trim()
  let type: MessageType = 'message'
  if (/^WANT\b/i.test(t))            type = 'want'
  else if (/^BID\b/i.test(t))        type = 'bid'
  else if (/^AWARD\b/i.test(t))      type = 'award'
  else if (/^ESCROW_FUNDED\b/i.test(t)) type = 'escrow-funded'
  else if (/^DRAFT_SUBMISSION\b/i.test(t)) type = 'draft'
  else if (/^REVIEW_FEEDBACK\b/i.test(t)) type = 'review'
  else if (/^DRAFT_APPROVED\b/i.test(t)) type = 'approved'
  else if (/^DELIVERED\b/i.test(t))  type = 'delivered'
  else if (/^ESCROW_RELEASED\b/i.test(t)) type = 'released'
  return { ...m, type, index }
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`
