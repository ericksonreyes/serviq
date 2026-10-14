# ADR-0026: Agent-held collections may remit via e-wallet

- Status: Accepted
- Date: 2026-10-15

## Context

The turn-in model assumes the agent remits physical cash: `submitTurnIn`
expects the sum of cash-method collections and treats `counted_cents` as
an agent-declared count of bills handed to the dispatcher. Field reality
is broader — an agent collects cash *and* customer e-wallet payments
(GCash/Maya), some of which land in the agent's own wallet, and then
remits the revenue by sending one e-wallet transfer to the
dispatcher/company wallet (often after cashing in the physical bills at a
kiosk). Two things the model could not express:

- **Who holds the money.** `payments.method` records *how* the customer
  paid, not *where the money sits*. A wallet payment direct to the
  company account is already settled (the `digital` remittance kind);
  a wallet payment into the agent's own wallet is agent-held revenue
  that still owes remittance — identical `method`, opposite treatment.
- **How the agent remits.** `turn_in` had no channel, no reference
  field, and no fraud check — a wallet transfer is exactly the case
  where evidence (the transfer receipt) carries a reusable reference
  number.

## Decision

- `Payment` gains a **holder** distinction: `agent`-held vs
  `company`-held. Cash is always agent-held; digital methods declare the
  destination at recording time (customer's wallet → agent wallet →
  agent-held; direct to company account → company-held). Company-held
  digital payments stay on the `digital` remittance path unchanged.
- `turn_in` gains a **channel**: `cash` covers the agent's pending
  cash-held collections (physical hand-over, existing behavior);
  `wallet` covers *all* agent-held collections — cash plus agent-held
  digital — because the typical flow is one transfer settling
  everything owed.
- A wallet turn-in's evidence is the `E_WALLET` transfer receipt. The
  parsed `amount_cents` supplies `counted_cents` (receipt over agent's
  word); `reference_no`, `provider`, and `sender` are stored on the
  remittance.
- The `referenceSeen` duplicate check — today batch-only — also runs on
  wallet turn-in references; a reused receipt routes to manual review,
  the same fraud guard as deposit batches.
- A wallet turn-in lands flagged for **manual review**: a screenshot is
  a claim, not settlement — the dispatcher verifies arrival in the
  company wallet before confirming `REMITTED`.
- `Remittance.TurnInSubmitted` gains `channel` and `reference` in its
  payload; no new event types.

## Consequences

- Variance and shortfall mechanics are unchanged — under-sent transfers
  flow through the same recount/override-or-deduct path (Payouts owns
  the deduction, ADR-0005).
- The AI's existing `e_wallet_receipt` parsing and
  `remittance_evidence_upload` tool cover the evidence leg; no new AI
  capability is required.
- The agent-held/company-held split fixes a latent bug, not just the
  new channel: an agent-wallet collection would previously sit in the
  `markDigital` set — dispatcher-remittable despite the money never
  having reached the company.
- The cash-hand-over path is untouched; this adds a remittance channel,
  it does not replace the existing one.
