# ADR-0004: Customer Support owns complaints and refund decisions

- Status: Accepted
- Date: 2026-10-09

## Context

The audit found complaint handling assigned to Customer & Request Management and refund
processing on the Dispatcher's AI tool list — with no bounded context actually owning case
work. Customer Support existed only as a "future context" note.

## Decision

Customer Support is a first-class bounded context (`serviq-customer-support-backend`) owning
cases, complaints, escalations, and refund *decisions*. Billing executes the resulting refund
payment — the decision (whether/if/how much) and the operation (moving money) are deliberately
split.

## Alternatives considered

- Complaints inside C&RM — requests and post-service grievances have different lifecycles,
  SLAs, and data; folding them in confuses the context.
- Dispatcher owns refunds — dispatch is job-routing; refund authority is a support/policy
  concern, not an ops one.

## Consequences

- Clear ownership for the whole complaint→resolution→refund-decision chain.
- A dedicated Customer Support agent profile owns `refund_process`/`refund_manage`/
  `complaint_manage` AI tools.
- C&RM remains interim complaint intake until the CS service ships.

See: `domain/specs/domain_boundaries/service_operations/CUSTOMER_SUPPORT.MD`,
`personas/CUSTOMER_SUPPORT.MD`.
