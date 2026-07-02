/** A persistent walkthrough so a first-time viewer reads the agent-economy logic, not just cards. */
export function Explainer() {
  return (
    <section className="explain" data-testid="explain">
      <p className="explain-lead">
        A government tendering marketplace on Solana. A public authority publishes
        a consultancy tender; suppliers submit competing bids;
        the winning supplier delivers the work and receives payment automatically upon delivery via Solana escrow.
      </p>
    </section>
  )
}
