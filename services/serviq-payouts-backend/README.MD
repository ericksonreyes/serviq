# Payouts Backend (:8021)

Agent-side money. `Assignment.Accepted` projects agent→job;
`Invoice.Issued` creates a payout (60% share stub). ADR-0005: unpaid
shortfalls (e.g. refunds) deduct from the next payout via `applied_cents`
ledger — net may go negative. `DisbursementPort` adapter boundary;
`StubDisbursement` returns deterministic refs. `/settle` → `Payout.Settled`.
