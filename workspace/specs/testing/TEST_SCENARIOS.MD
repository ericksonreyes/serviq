# Test Scenarios

The business flows automation must keep green. Each scenario lists preconditions, steps, and assertions; the "Level" column is the cheapest layer that proves it (feature = single service through HTTP kernel; integration = real broker between two services; E2E = browser).

## Golden path — request to payout

The demo spine. Every step is independently automatable; the full chain is the P0 integration flow.

| # | Step | Assertions | Level |
| --- | --- | --- | --- |
| 1 | Customer registers / accepts invite | user created in tenant scope, `Identity.UserRegistered` emitted | feature (identity) |
| 2 | Customer browses catalog, checks availability | service list + schedulable dates returned | feature (service-mgmt via BFF) |
| 3 | Customer submits request w/ schedule | request `submitted`, `Request.Submitted` emitted | feature (crm) |
| 4 | Dispatcher converts request → job | job `requested`/`ready_for_assignment`, projection exists in dispatch | integration (crm→job→dispatch) |
| 5 | Dispatcher assigns agent (or offer → accept) | `Assignment.Accepted` emitted, job `assigned`, execution projected | integration (dispatch→job→field) |
| 6 | Agent checks in, advances steps | `Execution.CheckedIn/Step*` emitted, job status projects | integration (field→job) |
| 7 | Agent uploads evidence (photo, part, note, signature) | evidence row + object_ref, `Execution.EvidenceCaptured` emitted | feature (field) |
| 8 | Agent completes execution | `Execution.Completed` → job `completed`, `Job.Completed` carries agent_id+customer_id | integration (field→job) |
| 9 | Billing consumes `Job.Completed` → invoice issued | invoice `issued`, amount per pricing, `Invoice.Issued` emitted, agent attributed | integration (job→billing) — `tests/integration/job-billing-payouts.mjs` |
| 10 | Digital payment: evidence submitted + reviewed | payment recorded, invoice `paid` | feature (billing) |
| 11 | Cash: agent turn-in → dispatcher confirms | remittance `pending_confirmation` → `confirmed`, invoices `remitted` | feature (billing) |
| 12 | `Invoice.Issued` → payout created | payout row w/ gross/net per policy, `Payout.Created` | integration (billing→payouts) — `tests/integration/job-billing-payouts.mjs` |
| 13 | Dispatcher settles payout | `Payout.Settled` w/ disbursement ref | feature (payouts) |

## Payment evidence and fraud guardrails

| Scenario | Expected | Level |
| --- | --- | --- |
| E-wallet evidence, clean parse | `accepted`, payment recorded on matching invoice | feature (billing) |
| Duplicate reference vs prior payment | flagged `duplicate_reference` → flagged queue, no payment | feature |
| Duplicate reference vs prior **batch** (deposit slip) | batch → `manual_review` | feature |
| Claimed ≠ parsed (agent typed wrong ref/amount) | flagged `claimed_mismatch` | feature |
| Parsed amount < invoice amount | flagged `under_remitted` | feature |
| `confidence < 0.6` | flagged `low_confidence` | feature |
| Flagged evidence | never creates a payment; lands in review queue; accept records payment, reject doesn't | feature |
| AI down at submit time | evidence still lands (claimed-only), reviewable | contract (BFF degrade) |

## Remittance reconciliation

| Scenario | Expected | Level |
| --- | --- | --- |
| `GET /remittances/expected?agent_id` | only that agent's `paid`+`cash` invoices | feature |
| Turn-in counted == expected | `pending_confirmation`, variance 0 | feature |
| Turn-in short | `variance_cents` set, `manual_review`-eligible | feature |
| Confirm matched turn-in | `remitted`, `Remittance.Confirmed`, invoices linked via `remittance_items` | feature |
| Confirm `override` on flagged | remits; `overridden_by` stamped | feature |
| Confirm `accept_shortfall` | remits + `Remittance.ShortfallAccepted` emitted | feature |
| Shortfall event → payouts | deduction row on agent ledger, idempotent on replay | integration (billing→payouts) — `tests/integration/idempotency-dlq.mjs` |
| Deposit-slip batch, clean | `pending_confirmation`, confirm → covered invoices `remitted` | feature |
| Batch deposit < expected | `manual_review`, not confirmable | feature |
| Deposit batch from a `REMITTANCE_RECEIPT` | same as `BANK_SLIP` — `pending_confirmation` → `remitted`; `E_WALLET` evidence rejected 422; receipt without a reference rejected | feature |
| Digital bulk remit | non-cash paid invoices → `remitted` immediately | feature |
| Cash invoice in digital set | 422 rejected | feature |
| Nothing reaches `remitted` without dispatcher confirm | no code path auto-settles | audit/feature |

## Lifecycle and edge cases

| Scenario | Expected | Level |
| --- | --- | --- |
| Customer cancels unsubmitted-status request | `Request.Cancelled`, request closed | feature (crm) |
| Reschedule on assigned/in-progress/completed/cancelled job | 409 rejected; allowed otherwise | feature (job-mgmt) |
| Agent rejects offer | re-offers next eligible agent | integration (dispatch) |
| Offer TTL expires | `Assignment.OfferExpired`, next candidate offered | integration (sweeper) |
| Refund: request → support decides → billing approves → gated execute | request `approved` on `Support.RefundDecided`; execute only via gated route; `Invoice.Refunded` + `Billing.RefundExecuted` | integration (support→billing) — decision → billing approval in `tests/integration/job-billing-payouts.mjs` |
| Invite → accept | invite `pending` → user created in invited role, `accepted`, token unusable after | feature (identity) |
| Invite wrong tenant / expired / replayed | 403/404/410; no user created | feature |
| Cross-tenant access | resource → 404, not 403 (no existence leak) | feature (all services) |
| Expired/blacklisted JWT | 401 on every protected route | feature |
| Agent role hits admin-only route | 403 | feature |

## Events and projections

| Scenario | Expected | Level |
| --- | --- | --- |
| Outbox row + domain write | commit atomically (kill mid-request → neither lands) | feature (transaction) |
| Consumer sees duplicate event_id | `processed_events` dedupes — handler runs once | integration — `idempotency-dlq.mjs` (payouts, notification), `job-billing-payouts.mjs` (billing) |
| Handler throws | NACK → DLQ, message not lost | integration — `idempotency-dlq.mjs` (billing), `ai-evidence.mjs` (ai-agent) |
| `Identity.InvitationCreated` | notification row on `email` channel (demo tenant enabled) | integration — `idempotency-dlq.mjs` |
| `Execution.EvidenceCaptured` (photo) | ai-agent consumer parses → `AI.PaymentProofParsed` | integration — `tests/integration/ai-evidence.mjs`: real MinIO object → parsed `bank_deposit_slip` with reference/amount; unfetchable object → `ai-agent.events.dlq` |
| Every cataloged event type | payload keys match [EVENT_CATALOG](../domain/specs/domain_events/EVENT_CATALOG.MD) | contract |

## Portal flows (browser E2E)

One E2E per persona, exercising the real chain — these validate the wiring, not every path (feature tests own the paths). Scripts live in `tests/e2e/`; run with `./scripts/test.sh tests/e2e`.

- **Customer:** login → catalog → book → track status → submit feedback — `golden-chain.mjs`, `customer-agent-lifecycle.mjs`
- **Service Agent:** login → accept job → check-in → steps → evidence → complete — `customer-agent-lifecycle.mjs`; offer accept / decline / expiry — `dispatch-strategies.mjs`. Collected cash → hand-over turn-in, and collected cash → over-the-counter deposit with an uploaded remittance-center receipt (AI Agent reads amount + reference) — `cash-remittance.mjs`.
- **Dispatcher:** review request → convert → confirm → release → assign (auto and manual) → cancel mid-flight → review flagged evidence — `golden-chain.mjs`, `customer-agent-lifecycle.mjs`, `dispatch-strategies.mjs`.; confirm turn-in and deposit-batch remittances — `cash-remittance.mjs`.
- **Tenant Admin:** create agent → invite agent → create user → create service → edit pricing — `tenant-admin.mjs`
- **Support:** open case → note → approve refund → verify billing state — `support.mjs`
- **Platform Admin:** login → metrics → tenant list → create → activate/suspend/reactivate (throwaway tenant, never `acme`) — `platform-admin.mjs`
- **Login negatives:** wrong password, unknown tenant slug — `login-negatives.mjs`
