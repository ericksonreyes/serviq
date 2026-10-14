# Cash Remittance Counting

This document describes the AI-assisted cash turn-in flow — a Service Agent (e.g. a rider collecting cash-on-delivery payments) hands physical cash to a dispatcher, and a vision model counts the laid-out bills and coins from a photo — and the follow-on bank deposit leg that closes a remittance batch.

## Goals

- Speed up end-of-shift cash reconciliation without removing human confirmation.
- Detect shortfalls immediately instead of at end-of-day ledger review.
- Keep every variance and override auditable.

## Flow

```text
Service Agent taps "Request Cash Turn-in"
        │
        ▼
Billing computes expected amount
  (sum of pending COD collections for that agent)
        │
        ▼
Dispatcher photographs the cash laid out on the counter
        │
        ▼
AI Agent — vision model counts denominations
        │
        ▼
{ "counted_total": 8500.00,
  "breakdown": { "1000_bills": 7, "500_bills": 2, "100_bills": 5 } }
        │
        ▼
Billing compares expected vs counted
        │
        ├── Match → dispatcher confirms → tickets marked REMITTED, ledger cleared
        │
        └── Variance → dispatcher portal shows the shortfall
                │
                ├── Human recount finds AI error → manual override + approve
                │     (audit flag: overridden_by = dispatcher user id)
                └── Real shortfall → accept with deduction
                      (shortfall recorded by Payouts as a deduction
                       against the agent's payout share)
```

## Rules

- The AI only **counts**. Expected sums, variance detection, status transitions, and ledger updates are all decided and executed by the responsible microservices: Billing owns the remittance comparison, and an accepted shortfall becomes a deduction adjustment owned by [Payouts](../../domain/specs/domain_boundaries/finance/PAYOUTS.MD) against the agent's share of the next payout.
- A variance never auto-resolves — a human dispatcher either recounts and overrides, or accepts the shortfall. Both paths write an audit record including who acted.
- Manual overrides must store `overridden_by` with the dispatcher's IAM user ID — see [Identifiers](../IDENTIFIERS.MD) and the IAM accountability rules.
- The denomination breakdown is advisory detail; the authoritative number is the confirmed count accepted by the dispatcher and recorded by Billing.

## Transfer Turn-in (e-wallet, bank deposit, remittance center)

An agent may also remit through an outside rail instead of handing over physical cash: an e-wallet transfer to the company wallet (GCash/Maya), a deposit straight into the company bank account, or a remittance-center send (Palawan Express, Cebuana, etc.) — then presents the receipt to the dispatcher as proof of turn-in. See [ADR-0026](../../decisions/0026-agent-remittance-via-e-wallet.MD) and [ADR-0027](../../decisions/0027-agent-remittance-via-bank-or-remittance-center.MD) for the domain decisions.

| Channel | Evidence document | Dispatcher verifies arrival at |
| --- | --- | --- |
| `wallet` | `E_WALLET` receipt | company e-wallet |
| `bank` | `BANK_SLIP` deposit slip | company bank account |
| `remittance_center` | `REMITTANCE_RECEIPT` | remittance-center payout |

```text
Agent uploads the transfer receipt (any rail)
        │
        ▼
AI Agent — vision model classifies the document and extracts
           provider/bank, sender, amount, reference number
        │
        ▼
Billing compares sent amount vs agent-held collections
  (cash + customer wallet payments held by the agent —
   company-held digital payments are already settled)
        │
        ▼
Manual review — the receipt is a claim, not settlement;
dispatcher confirms arrival at the rail's destination
        │
        ├── Reference reused (prior payment or remittance)
        │     → duplicate_reference flag
        ├── Wrong document for the channel → rejected at intake
        ├── Sent < expected → variance, same shortfall path
        │     (recount/override or accept + Payouts deduction)
        └── Clean + funds arrived → dispatcher confirms REMITTED
```

## Rules — transfer turn-in

- The sent amount comes from the parsed receipt, not the agent's typed-in figure.
- The transfer's reference number is stored on the remittance and checked for reuse across payments and prior remittances — a screenshot can be re-submitted, a reference cannot.
- A transfer turn-in never skips manual review: the dispatcher verifies the money actually arrived at the rail's destination before confirming.
- The channel must match the evidence document — a `bank` turn-in requires a `BANK_SLIP`; an e-wallet receipt cannot stand in for it.
- The AI also extracts the **recipient** (`recipient_name`/`recipient_account`) and the provider (`provider`/`bank`) — a receipt naming a recipient other than the tenant's configured receiving accounts (`company_accounts`, per rail) flags `recipient_mismatch` at intake, and the flag travels to the turn-in so only an explicit override or reject can settle it.
- A `cash`-channel turn-in settles only cash-held collections; every transfer-channel turn-in settles all agent-held collections.

## Bank Deposit and Batch Remittance

Confirmed cash sits with the dispatcher until it is deposited at a bank. The deposit closes the loop: one deposit slip remits a whole batch of cash collections at once.

```text
Dispatcher deposits collected cash at a bank
        │
        ▼
Dispatcher uploads the deposit slip
        │
        ▼
AI Agent — vision model classifies BANK_SLIP and extracts
           bank, date/time, deposited amount, reference number
        │
        ▼
Billing validates:
  ├── deposited amount covers the cash collections in the batch
  └── reference number unused across payments and prior batches
        │
        ▼
Dispatcher confirms → covered collections marked REMITTED
        │
        └── Anomaly (shortfall, reused reference, low-confidence parse)
            → manual review queue — nothing remits automatically
```

## Rules — batch remittance

- A remittance batch closes only on explicit dispatcher confirmation; the AI extract is advisory and never marks anything remitted by itself.
- Billing checks the slip's reference number against previously recorded references — across individual payments and prior batches — before the batch may close. A reused reference routes the batch to manual review; this is the fraud guard against re-submitting one slip for multiple deposits.
- The deposit slip is evidence, not bank-ledger truth — verifying against the bank's own records stays out of scope, per [Proof of Payment Parsing](./PROOF_OF_PAYMENT_PARSING.MD).
- A batch record stores its member collections, the slip's reference number, and `confirmed_by` with the dispatcher's IAM user ID.
- A deposited amount below the batch total surfaces as a shortfall to the dispatcher, same as a turn-in variance — recount/override or accept, with the audit record naming who acted.

## Related Documentation

- [Proof of Payment Parsing](./PROOF_OF_PAYMENT_PARSING.MD) — `CASH_PHOTO` extraction rules
- [AI Agent](./README.MD) — constraint principle (advisor/monitor, never executor)
- [Billing](../../domain/specs/domain_boundaries/finance/BILLING.MD)
- [Identity & Access (IAM)](../security/IDENTITY_AND_ACCESS.MD) — accountability fields
