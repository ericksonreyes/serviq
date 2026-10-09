# ADR-0005: Cash-remittance shortfalls are Payouts deductions

- Status: Accepted
- Date: 2026-10-09

## Context

When a dispatcher accepts a remittance with a shortfall (counted cash < expected), someone
must own the resulting debt record. Candidates: Billing (records the remittance), Workforce
(agent management), or Payouts (money owed to the agent).

## Decision

Payouts owns the shortfall as a deduction adjustment against the agent's payout share. Billing
records the remittance outcome and emits the event; Payouts turns an accepted shortfall into a
monetary consequence for the agent.

## Alternatives considered

- Billing owns the debt — Billing tracks money received, not agent obligations; a "debt" is a
  payout adjustment in nature.
- Workforce owns it — Workforce manages rosters/availability, not money movement.

## Consequences

- The agent-visible consequence (smaller payout) lives where payout logic already runs.
- Manual recount overrides stay audited in Billing (`overridden_by` = dispatcher IAM ID);
  only the *financial* effect lands in Payouts.

See: `technical/ai/CASH_REMITTANCE.MD`,
`domain/specs/domain_boundaries/finance/PAYOUTS.MD`.
