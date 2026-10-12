# Test Scenarios

The business flows automation must keep green. Each scenario lists preconditions, steps, and assertions; the "Level" column is the cheapest layer that proves it (feature = single service through HTTP kernel; integration = real broker between two services; E2E = browser), with the covering suite named where automation exists. ✅ = automated coverage exists; unmarked = planned.

## Golden path — request to payout

The demo spine. Every step is independently automatable; the full chain is the P0 integration flow.

| ✅ | # | Step | Assertions | Level |
| --- | --- | --- | --- | --- |
| ✅ | 1 | Customer registers / accepts invite | user created in tenant scope, `Identity.UserRegistered` emitted | feature — identity `RegisterTest`, `InvitationFlowTest`; E2E `customer-self-service.mjs` |
| ✅ | 2 | Customer browses catalog, checks availability | service list + schedulable dates returned | E2E — `golden-chain.mjs`, `customer-self-service.mjs` |
| ✅ | 3 | Customer submits request w/ schedule | request `submitted`, `Request.Submitted` emitted | E2E — `golden-chain.mjs` |
| ✅ | 4 | Dispatcher converts request → job | job `requested`/`ready_for_assignment`, projection exists in dispatch | feature — dispatch `JobProjectionTest`; E2E `golden-chain.mjs` |
| ✅ | 5 | Dispatcher assigns agent (or offer → accept) | `Assignment.Accepted` emitted, job `assigned`, execution projected | feature — dispatch `OfferFlowTest`, field `WorkflowSeedTest`; E2E `customer-agent-lifecycle.mjs` |
| ✅ | 6 | Agent checks in, advances steps | `Execution.CheckedIn/Step*` emitted, job status projects | E2E — `customer-agent-lifecycle.mjs` |
| ✅ | 7 | Agent uploads evidence (photo, part, note, signature) | evidence row + object_ref, `Execution.EvidenceCaptured` emitted | E2E — `customer-agent-lifecycle.mjs` |
| ✅ | 8 | Agent completes execution | `Execution.Completed` → job `completed`, `Job.Completed` carries agent_id+customer_id | feature — job `ExecutionCompletedTest`; E2E `customer-agent-lifecycle.mjs` |
| ✅ | 9 | Billing consumes `Job.Completed` → invoice issued | invoice `issued`, amount per pricing, `Invoice.Issued` emitted, agent attributed | integration — `tests/integration/job-billing-payouts.mjs`; E2E `customer-agent-lifecycle.mjs` |
| ✅ | 10 | Digital payment: evidence submitted + reviewed | payment recorded, invoice `paid` | feature — billing `RemittanceFlowTest`; E2E `money-flows.mjs` |
| ✅ | 11 | Cash: agent turn-in → dispatcher confirms | remittance `pending_confirmation` → `confirmed`, invoices `remitted` | feature — billing `RemittanceFlowTest`; E2E `cash-remittance.mjs` |
| ✅ | 12 | `Invoice.Issued` → payout created | payout row w/ gross/net per policy, `Payout.Created` | integration — `tests/integration/job-billing-payouts.mjs` |
| ✅ | 13 | Dispatcher settles payout | `Payout.Settled` w/ disbursement ref | feature — payouts `PayoutFlowTest`; E2E `money-flows.mjs` |

## Payment evidence and fraud guardrails

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | E-wallet evidence, clean parse | `accepted`, payment recorded on matching invoice | feature — billing `RemittanceFlowTest`; E2E `money-flows.mjs` |
| ✅ | Duplicate reference vs prior payment | flagged `duplicate_reference` → flagged queue, no payment | feature — billing `RemittanceFlowTest`; E2E `customer-agent-lifecycle.mjs` |
| ✅ | Duplicate reference vs prior **batch** (deposit slip) | batch → `manual_review` | feature — billing `RemittanceFlowTest` |
| ✅ | Claimed ≠ parsed (agent typed wrong ref/amount) | flagged `claimed_mismatch` | feature — billing `RemittanceFlowTest` |
| ✅ | Parsed amount < invoice amount | flagged `under_remitted` | feature — billing `RemittanceFlowTest` |
| ✅ | `confidence < 0.6` | flagged `low_confidence` | feature — billing `RemittanceFlowTest`; E2E `customer-agent-lifecycle.mjs` |
| ✅ | Flagged evidence | never creates a payment; lands in review queue; accept records payment, reject doesn't | feature — billing `RefundFlowTest`; E2E `money-flows.mjs` |
| ✅ | AI down at submit time | evidence still lands (claimed-only), reviewable | contract — agent BFF `ai-degrade.test.mjs` |

## Remittance reconciliation

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | `GET /remittances/expected?agent_id` | only that agent's `paid`+`cash` invoices | feature — billing `RemittanceFlowTest` |
| ✅ | Turn-in counted == expected | `pending_confirmation`, variance 0 | feature — billing `RemittanceFlowTest`; E2E `cash-remittance.mjs` |
| ✅ | Turn-in short | `variance_cents` set, `manual_review`-eligible | feature — billing `RemittanceFlowTest`; E2E `money-flows.mjs` |
| ✅ | Confirm matched turn-in | `remitted`, `Remittance.Confirmed`, invoices linked via `remittance_items` | feature — billing `RemittanceFlowTest`; E2E `cash-remittance.mjs` |
| ✅ | Confirm `override` on flagged | remits; `overridden_by` stamped | E2E — `money-flows.mjs` |
| ✅ | Confirm `accept_shortfall` | remits + `Remittance.ShortfallAccepted` emitted | feature — billing `RemittanceFlowTest`; E2E `money-flows.mjs` |
| ✅ | Shortfall event → payouts | deduction row on agent ledger, idempotent on replay | integration — `tests/integration/idempotency-dlq.mjs`; feature `PayoutFlowTest` |
| ✅ | Deposit-slip batch, clean | `pending_confirmation`, confirm → covered invoices `remitted` | feature — billing `RemittanceFlowTest`; E2E `cash-remittance.mjs` |
| ✅ | Batch deposit < expected | `manual_review`, `confirm` → 422 until override | feature — billing `RemittanceFlowTest` |
| ✅ | Deposit batch from a `REMITTANCE_RECEIPT` | same as `BANK_SLIP` — `pending_confirmation` → `remitted`; `E_WALLET` evidence rejected 422; receipt without a reference rejected | feature — billing `RemittanceFlowTest`; E2E `cash-remittance.mjs` |
| ✅ | Digital bulk remit | non-cash paid invoices → `remitted` immediately | feature — billing `RemittanceFlowTest`; E2E `money-flows.mjs` |
| ✅ | Cash invoice in digital set | 422 rejected | feature — billing `RemittanceFlowTest` |
| ✅ | Nothing reaches `remitted` without dispatcher confirm | `paid` invoice never self-settles; no `remitted` remittance exists post-pay | feature — billing `RemittanceFlowTest` |

## Lifecycle and edge cases

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Customer cancels unsubmitted-status request | `Request.Cancelled`, request closed | E2E — `customer-self-service.mjs` |
| ✅ | Reschedule on assigned/in-progress/completed/cancelled job | 409 rejected; allowed otherwise | feature — job `RescheduleTest`; E2E `dispatch-ops.mjs` |
| ✅ | Agent rejects offer | re-offers next eligible agent | feature — dispatch `OfferFlowTest`; E2E `dispatch-strategies.mjs` |
| ✅ | Offer TTL expires | `Assignment.OfferExpired`, next candidate offered | feature — dispatch `OfferFlowTest`; E2E `dispatch-strategies.mjs` |
| ✅ | Refund: request → support decides → billing approves → gated execute | request `approved` on `Support.RefundDecided`; execute only via gated route; `Invoice.Refunded` + `Billing.RefundExecuted` | feature — billing `RefundFlowTest`, support `support.test.mjs`; integration `tests/integration/job-billing-payouts.mjs`; E2E `support.mjs`, `money-flows.mjs` |
| ✅ | Invite → accept | invite `pending` → user created in invited role, `accepted`, token unusable after | feature — identity `InvitationFlowTest` |
| ✅ | Invite wrong tenant / expired / replayed | 403/404/410; no user created | feature — identity `InvitationFlowTest` |
| ✅ | Cross-tenant access | resource → 404, not 403 (no existence leak) | feature — identity `TenantAdministratorScopeTest`, dispatch `OfferFlowTest`, payouts `PayoutFlowTest`, support `support.test.mjs` |
| ✅ | Expired JWT | 401 on a protected route | feature — billing `RemittanceFlowTest` (blacklist revocation needs the Redis `TokenBlacklist`, which test envs don't run) |
| ✅ | Login/register/invite-accept issue a token pair | `access_token` + `refresh_token` in response | feature — identity `RefreshTokenTest` |
| ✅ | Refresh rotation | presented refresh revoked; new pair issued; reuse → 401 `invalid_refresh_token` | feature — identity `RefreshTokenTest` |
| ✅ | Expired refresh token / revoked user / missing field | 401 or 422 — session ends | feature — identity `RefreshTokenTest` |
| ✅ | Logout | access `jti` blacklisted + refresh revoked → subsequent refresh 401 | feature — identity `RefreshTokenTest` |
| ✅ | Agent role hits admin-only route | 403 | feature — identity `InvitationFlowTest`, `RegisterTest` |
| ✅ | Availability factors — business hours, business days, recurring holidays (`MM-DD`), provider non-working days (`Y-m-d`), projected agent schedules × capacity | day closed / `slots` = Σ(shift-overlap ÷ job minutes × capacity); `times` = whole-job starts inside a shift; `hours` = hourly starts flagged by coverage | feature — service-management `ServiceAvailabilityTest` |
| ✅ | 24/7 operations — provider sets `open 00:00, close 24:00` | hourly starts 00:00–23:00, each flagged by agent coverage; `close` values past `24:00` never emitted | feature — service-management `ServiceAvailabilityTest` |
| ✅ | Availability crews fallback | used only when the tenant has NO agent projection; all-inactive agents → closed, not crews | feature — service-management `ServiceAvailabilityTest` |

## Events and projections

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Outbox row + domain write | commit atomically (kill mid-request → neither lands) | feature — billing + job `OutboxAtomicityTest` |
| ✅ | Consumer sees duplicate event_id | `processed_events` dedupes — handler runs once | integration — `idempotency-dlq.mjs` (payouts, notification), `job-billing-payouts.mjs` (billing) |
| ✅ | Handler throws | NACK → DLQ, message not lost | integration — `idempotency-dlq.mjs` (billing), `ai-evidence.mjs` (ai-agent) |
| ✅ | `Identity.InvitationCreated` | notification row on `email` channel (demo tenant enabled) | integration — `idempotency-dlq.mjs` |
| ✅ | `Execution.EvidenceCaptured` (photo) | ai-agent consumer parses → `AI.PaymentProofParsed` | integration — `tests/integration/ai-evidence.mjs`: real MinIO object → parsed `bank_deposit_slip` with reference/amount; unfetchable object → `ai-agent.events.dlq` |
| ✅ | Every cataloged event type | payload keys match [EVENT_CATALOG](../domain/specs/domain_events/EVENT_CATALOG.MD) | contract — `tests/integration/event-catalog.mjs` |
| ✅ | `Platform.TenantCreated` | IAM tenant scope + provisioned Tenant Administrator permissions | feature — identity `TenantAdministratorScopeTest`; E2E `platform-admin.mjs` |
| ✅ | Notification routing matrix — right persona/channel per event | offers → agent, status updates → customer, staff traffic never leaks | E2E — `dispatch-strategies.mjs`, `customer-self-service.mjs` |
| ✅ | `Workforce.AgentRegistered` / `AgentUpdated` | service-management consumer rebuilds `projected_agent_availability` (days, shift window, status, capacity) — payload carries `availability` slots | feature — service-management `ServiceAvailabilityTest` (projection-driven math); live-verified: agent PATCH → consumer log → projection rows |

## Portal flows (browser E2E)

Per-scenario inventory in the `APP_FEATURES.MD` convention — ✅ scripted in `tests/e2e/` (script named in the Level column), unmarked = planned. These validate the wiring, not every path (feature tests own the paths). Run with `./scripts/test.sh tests/e2e`.

### Customer Portal

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Signup → address book (add/edit/delete) → book → cancel → notifications | account created, request cancelled, only own notifications visible | E2E — `customer-self-service.mjs` |
| ✅ | Login → catalog → book → track → feedback | request reaches `completed`, review submitted | E2E — `golden-chain.mjs`, `customer-agent-lifecycle.mjs` |
| ✅ | Chatbot: `service_request_status` | reply reports the request's live status | E2E — `chatbots.mjs` |
| ✅ | Chatbot: `service_request_cancel` | policy-gated cancel lands — a real write via chat | E2E — `chatbots.mjs` |
| ✅ | Chatbot: `complaint_file` | support case created, reference returned | E2E — `chatbots.mjs` |
| ✅ | Chatbot: `service_availability` | schedulable dates returned | E2E — `chatbots.mjs` |
| ✅ | Chatbot: `service_request_create` | request created from a chat message | E2E — `chatbots.mjs` |
| ✅ | Chatbot: `refund_request` | refund request `pending` | E2E — `chatbots.mjs` |
| ✅ | Onboarding by invitation | rendered accept link → invited signup → home | E2E — `invitations.mjs` |
| ✅ | Public provider directory (`GET /v1/providers`, `/{slug}`) | active-only, name/slug/description fields only, 404 on unknown/inactive | Feature — `ProviderDirectoryTest` |
|  | Landing → debounced provider search → provider homepage → sign in | results clickable; `/provider/:slug` shows name/description + login/signup | E2E (planned) |

### Service Agent Portal

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Home → open job → check-in → steps → evidence → confirmation → complete | job `completed`, evidence rows | E2E — `customer-agent-lifecycle.mjs` |
| ✅ | Offer accept / decline / expiry | accept assigns; decline re-offers; TTL hides the offer | E2E — `dispatch-strategies.mjs` |
| ✅ | Navigate link + typed-name customer confirmation | maps URL targets the customer address; signature captured | E2E — `customer-self-service.mjs` |
| ✅ | Collect cash → hand-over turn-in → dispatcher confirm | remittance `pending_confirmation` → `confirmed` | E2E — `cash-remittance.mjs` |
| ✅ | Collect cash → OTC deposit w/ receipt upload → dispatcher confirm | AI reads amount+ref, batch `pending_confirmation` → `confirmed` | E2E — `cash-remittance.mjs` |
| ✅ | E-wallet receipt upload → flagged → dispatcher accept | invoice paid digitally, bulk-remitted | E2E — `money-flows.mjs` |
| ✅ | Agent self-signup page | account usable for login | E2E — `invitations.mjs` |
| ✅ | Onboarding by invitation | rendered accept link → invited signup → home | E2E — `invitations.mjs` |
| | `self` strategy — agent picks up an open job | job assigned to the picking agent | blocked — backend `POST /dispatch/self-assign` exists but no agent UI exposes it |

### Tenant Console

#### Tenant Administrator

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Add agent → invite agent → create staff user → create service → edit pricing | roster/user/catalog rows land | E2E — `tenant-admin.mjs` |
| ✅ | Configure assignment strategy + broadcast TTL | rules saved; restores `automatic` | E2E — `dispatch-strategies.mjs` |
| ✅ | Service areas — add, rename, remove | area row lifecycle | E2E — `dispatch-ops.mjs` |
| ✅ | Agent deactivate / reactivate | roster status flips | E2E — `dispatch-ops.mjs` |
| ✅ | Settle a pending payout | payout `settled` | E2E — `money-flows.mjs` |
| ✅ | Revenue & payout review — invoices, payouts, refunds tabs | read models render | E2E — `money-flows.mjs`, `support.mjs` |
| ✅ | Provider self-registration on the console (`/signup`) | org created → admin signs in under the new slug | E2E — `invitations.mjs` |
| ✅ | Business settings — operating hours, cancellation policy | settings saved (operational flags untouched — `auto_broadcast` affects dispatch) | E2E — `console-ops.mjs` |
| ✅ | Customers page — create a customer + invite | customer row lands; accept link rendered | E2E — `invitations.mjs` |

#### Dispatcher

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Request → convert → confirm → release → auto-assign | job `assigned` via `automatic` strategy | E2E — `golden-chain.mjs`, `customer-agent-lifecycle.mjs` |
| ✅ | Manual assign (browse eligible) → cancel mid-flight | `assigned` then `cancelled`; drops off agent's list | E2E — `dispatch-strategies.mjs` |
| ✅ | Broadcast offers — decline, accept, expiry | re-offer, assignment, expiry sweep | E2E — `dispatch-strategies.mjs` |
| ✅ | Reschedule + reassign an assigned job | `Rescheduled.`, `Agent assigned.` | E2E — `dispatch-ops.mjs` |
| ✅ | Confirm turn-in and deposit-batch remittances | both `confirmed` | E2E — `cash-remittance.mjs` |
| ✅ | Digital bulk remit + short turn-ins (accept-shortfall, override) | remitted / overridden / shortfall accepted | E2E — `money-flows.mjs` |
| ✅ | Review flagged evidence (duplicate reference) | accept records payment; flag visible | E2E — `customer-agent-lifecycle.mjs`, `money-flows.mjs` |
| ✅ | Check customer location on a request/job | address detail renders in the queue | E2E — `console-ops.mjs` |
| ✅ | CommandBox: `service_agent_search`, `service_request_search`, `repair_guide_search`, `dispatch_recommend` | each tool routes and answers | E2E — `chatbots.mjs` |
| | CommandBox: `cash_turnin_count` (photo upload) | counted total submitted for confirmation | blocked — CommandBox is text-only; no file input |
| | CommandBox: `remittance_evidence_upload` (slip upload) | evidence lands for review | blocked — CommandBox is text-only; no file input |

#### Customer Support

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Open case → note → approve refund → Billing state | `Support.RefundDecided` → refund `approved` | E2E — `support.mjs` |
| ✅ | Deny a refund | decision recorded; Billing creates nothing | E2E — `money-flows.mjs` |
| ✅ | ChatPanel: `complaint_manage` list, `refund_manage` list | each tool routes and answers | E2E — `chatbots.mjs` |
| ✅ | Case status transitions via console (in_progress / escalated / resolved) | status moves; also feature-covered by `support.test.mjs` | E2E — `console-ops.mjs` |
| ✅ | ChatPanel: escalate / resolve / note a case | case status/note lands via chat write | E2E — `chatbots.mjs` |
| | ChatPanel: `refund_process` | pending refund → upstream 409 gate reply (`chatbots.mjs`); approved refund → `executed` still needs an approved refund in the same run | partial — gate proven, execution pending |

### Platform Admin Console

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Login → dashboard metrics → tenant list | metrics + `acme` render | E2E — `platform-admin.mjs` |
| ✅ | Create tenant → activate → suspend → reactivate | lifecycle transitions on a throwaway tenant | E2E — `platform-admin.mjs` |
| ✅ | Create + edit a subscription plan | catalog row lands, name updates | E2E — `platform-admin-ops.mjs` |
| ✅ | Feature flag — add, enable, disable | flag state toggles | E2E — `platform-admin-ops.mjs` |
| ✅ | Create platform user + create a role | user row + role card land | E2E — `platform-admin-ops.mjs` |
| ✅ | Platform settings JSON save | `Settings saved.`, existing keys preserved | E2E — `platform-admin-ops.mjs` |
| ✅ | Income & settlement report | totals + per-tenant table render | E2E — `platform-admin-ops.mjs` |
| ✅ | Assign a plan/subscription to a tenant (tenant detail) | `On <plan> (active)` shown on the tenant | E2E — `platform-admin-ops.mjs` |
| ✅ | Disable/enable a platform user; grant permissions to a role | status flips; permission badges grow | E2E — `platform-admin-ops.mjs` |

### Cross-portal

| ✅ | Scenario | Expected | Level |
| --- | --- | --- | --- |
| ✅ | Wrong password (console), unknown tenant slug (customer) | visible error, stays on `/login` | E2E — `login-negatives.mjs` |
| ✅ | Login negatives on agent + platform portals | same refusal behaviour | E2E — `login-negatives.mjs` |
| | Chat file-upload surfaces (`proof_of_payment_upload`, `remittance_evidence_upload` via chat) | parsed evidence lands — uploads currently run through job/turn-in UIs | blocked — no chat surface has a file input |
