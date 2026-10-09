# Cash Remittance Counting

This document describes the AI-assisted cash turn-in flow: a Service Agent (e.g. a rider collecting cash-on-delivery payments) hands physical cash to a dispatcher, and a vision model counts the laid-out bills and coins from a photo.

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

## Related Documentation

- [Proof of Payment Parsing](./PROOF_OF_PAYMENT_PARSING.MD) — `CASH_PHOTO` extraction rules
- [AI Agent](./README.MD) — constraint principle (advisor/monitor, never executor)
- [Billing](../../domain/specs/domain_boundaries/finance/BILLING.MD)
- [Identity & Access (IAM)](../security/IDENTITY_AND_ACCESS.MD) — accountability fields
