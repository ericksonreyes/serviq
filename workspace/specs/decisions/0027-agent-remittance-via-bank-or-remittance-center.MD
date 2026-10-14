# ADR-0027: Agent-held collections may also remit via bank deposit or remittance center

- Status: Accepted
- Date: 2026-10-14

## Context

ADR-0026 split agent turn-ins into two channels: `cash` (physical
hand-over to the dispatcher) and `wallet` (one e-wallet transfer
settling all agent-held collections). A third family of real-world
settlement was missed: the agent can remit *externally* without a
dispatcher intermediary — depositing directly to the company bank
account, or sending through a remittance center (Palawan Express,
Cebuana, etc.) — then presenting the **deposit slip or remittance
receipt** to the dispatcher as proof of turn-in.

These flows share the wallet pattern exactly: the agent settles through
an outside rail, the receipt is the claim, and a human verifies arrival
before anything counts as remitted. What differs is only *which
document proves it* (`BANK_SLIP` vs `REMITTANCE_RECEIPT` vs
`E_WALLET`) and *where the dispatcher verifies* (bank statement,
remittance-center payout, company wallet).

## Decision

- `turn_in` gains two more channels: `bank` and `remittance_center`,
  alongside `cash` and `wallet`.
- All non-`cash` channels are **transfer rails** governed by one rule
  set (extending ADR-0026): they settle *all* agent-held collections in
  a single turn-in; the evidence document supplies `counted_cents` and
  `reference`; the reference is dedupe-checked; the turn-in lands in
  `manual_review` until the dispatcher verifies arrival at the
  rail-specific destination.
- Channel → evidence mapping is fixed and validated: `wallet` requires
  `E_WALLET`, `bank` requires `BANK_SLIP`, `remittance_center` requires
  `REMITTANCE_RECEIPT`. A receipt for the wrong rail is rejected — the
  document must match the settlement path the agent claims.
- Each rail carries a distinct mandatory-verification flag —
  `wallet_transfer`, `bank_transfer`, `remittance_transfer` — so
  downstream reporting and review can tell rails apart while the
  confirm-gate treats them uniformly (flag alone = verify arrival, not
  an anomaly).
- Receipts additionally carry a **recipient**: the AI extracts
  `recipient_name`/`recipient_account` (and `bank` on deposit slips),
  and the tenant configures its receiving accounts per rail
  (`company_accounts`). A parsed recipient matching nothing configured
  flags `recipient_mismatch` — a real-looking receipt paying the wrong
  wallet is the sharpest fraud vector here, and eyeballing alone is not
  a control.

## Consequences

- No new domain machinery: `submitTransferTurnIn` generalizes the
  wallet path; expected totals, attachment, variance, and confirm
  semantics are unchanged.
- The AI already parses all three document types
  (`e_wallet_receipt`, `bank_deposit_slip`, `remittance_receipt`) — no
  new AI capability.
- `deposit_batch` remains a *dispatcher* kind — pooled cash leaving the
  station. An agent-initiated bank deposit is a `turn_in` with
  `channel=bank`; the two never mix (a batch's slip covers
  dispatcher-held collections, a turn-in's slip covers agent-held).
- `expectedForAgent` gains `held_expected_cents` (kept
  `wallet_expected_cents` as a legacy alias) since the total now
  applies to every transfer rail, not just e-wallet.
