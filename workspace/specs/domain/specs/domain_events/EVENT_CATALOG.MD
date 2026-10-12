# Event Catalog

Every domain event currently emitted in `services/`, grouped by publishing context. Payload lists are the emitted keys (always alongside the shared envelope). A key followed by a parenthetical containing "only", "path" or "optional" is conditional; every other backticked key must appear in every emission (value may be `null`). Enforced by `scripts/contract-check.mjs` (every emitted type is cataloged) and `tests/integration/event-catalog.mjs` (live outbox payloads carry the cataloged keys). "Consumers" names the domain/read-model subscribers; the notification backend consumes everything (`#` binding) and the consumer map below lists every subscription.

## Platform Management — `serviq-platform-management-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Platform.TenantCreated` | Tenant (or tenant+owner signup) created | `tenant_id`, `name`, `slug`, `plan_id`, `initial_users[]` (signup path only) |
| `Platform.TenantActivated` | Tenant lifecycle transition → active | `tenant_id` |
| `Platform.TenantSuspended` | Lifecycle transition → suspended | `tenant_id`, `status` |
| `Platform.TenantDeactivated` | Lifecycle transition → deactivated | `tenant_id`, `status` |
| `Platform.PlanCreated` | Subscription plan defined | plan fields |
| `Platform.SubscriptionAssigned` | Plan assigned to tenant | subscription fields |

Consumers: Identity & Access (`Platform.TenantCreated` → registers the tenant scope).

## Identity & Access — `serviq-identity-access-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Identity.UserRegistered` | Self-signup, admin create, or invite accept | `user_id`, `scope`, `username`, `roles`, `source` (`self_signup` \| `invitation` \| `admin`), `invited_by` (invite path) |
| `Identity.UserDisabled` | User deactivated | `user_id`, `scope` |
| `Identity.RoleAssigned` | Roles synced on a user | `user_id`, `scope`, `roles` |
| `Identity.TenantScopeRegistered` | IAM registers a tenant scope | scope fields |
| `Identity.InvitationCreated` | Staff invites a customer/agent by email | `invitation_id`, `email`, `role`, `tenant_slug`, `token`, `accept_url`, `invited_by` |

Consumers: notification only (invite email, in-app notices). **Note:** `token` in the payload is the raw accept token — acceptable inside the broker's trust boundary today; revisit before exposing event streams externally.

## Customer & Request Management — `serviq-customer-request-management-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Customer.Created` | Customer record created | `customer_id`, `name` |
| `Customer.Updated` | Customer profile changed | `customer_id` |
| `Customer.AddressSaved` | Address created/updated | `customer_id`, address fields |
| `Customer.AddressRemoved` | Address deleted | `customer_id` |
| `Request.Submitted` | Service request placed | `request_id`, `customer_id`, `service_id`, `preferred_date`, `scheduled_for` |
| `Request.Cancelled` | Customer/staff cancels | `request_id` |
| `Request.Converted` | Dispatcher converts request → job | `request_id`, `customer_id`, `service_id`, `details` |
| `Request.FeedbackSubmitted` | Post-completion review | `request_id`, `customer_id`, `rating` |

Consumers: Service Job Management (`Request.Submitted` → job creation), Customer Portal BFF projector (`Request.*` → Mongo read model).

## Service Management — `serviq-service-management-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `ServiceManagement.ServiceCreated` | Catalog service created | `service_id`, catalog fields |
| `ServiceManagement.ServiceUpdated` | Catalog service changed | `service_id`, catalog fields |
| `ServiceManagement.ServicePricingUpdated` | Pricing rules changed | `service_id`, pricing fields |
| `ServiceManagement.WorkflowTemplateChanged` | Service steps edited | `service_id`, step template |
| `ServiceManagement.ServiceAreaCreated` / `ServiceAreaUpdated` / `ServiceAreaDeleted` | Service area CRUD | area fields |
| `ServiceManagement.CoverageInterested` | Customer registered demand for an uncovered location | `admin_code` |
| `ServiceManagement.SettingsUpdated` | Tenant operational settings saved | `settings` |

Consumers: Service Job Management (`ServiceCreated`, `WorkflowTemplateChanged` → workflow-template projection).

## Service Job Management — `serviq-service-job-management-backend`

All `Job.*` payloads carry `job_id` plus the keys listed.

| Event | Emitted when | Extra payload keys |
| --- | --- | --- |
| `Job.Requested` | Job created from a converted request | request/service fields |
| `Job.ReadyForAssignment` | Job enters dispatch queue | `service_id`, `scheduled_for` |
| `Job.Assigned` | Dispatcher/AI assigns an agent | `agent_id` |
| `Job.Accepted` | Agent accepts (projection back from dispatch) | `agent_id` |
| `Job.Started` | Agent checks in | `agent_id` |
| `Job.Confirmed` | Customer confirms | — |
| `Job.Rescheduled` | Job rescheduled (not assigned/in-flight/done) | `scheduled_for`, `previous_scheduled_for` |
| `Job.Completed` | Execution completes → **billing trigger** | `agent_id`, `customer_id` |
| `Job.Cancelled` | Job cancelled | `reason` |
| `Job.WorkflowStepStarted` / `Job.WorkflowStepCompleted` | Step transitions on the job | `step_position`, `step_name` |
| `Job.WorkflowReordered` | Step order changed | step ordering |

Consumers: Assignment & Dispatch (`Job.*` → dispatchable-job projection), Field Execution (`Job.Requested`, `Job.WorkflowStep*` → execution projection), Billing (`Job.Completed` → invoice issuance), Customer Portal BFF (`Job.*` → read model).

## Workforce Management — `serviq-workforce-management-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Workforce.AgentRegistered` | Agent record created | full agent profile |
| `Workforce.AgentUpdated` | Agent profile/status changed | full agent profile |

Consumers: Assignment & Dispatch (`Workforce.*` → eligible-agent projection).

## Assignment & Dispatch — `serviq-assignment-dispatch-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Assignment.Offered` | Offer extended to an agent | `job_id`, `agent_id`, `offer_id`, `expires_at` |
| `Assignment.OfferExpired` | Offer TTL lapses (sweeper command) | `job_id`, `agent_id`, `offer_id`, `assignment_id` (same id, legacy key) |
| `Assignment.Accepted` | Offer accepted or dispatcher direct-assigns | `job_id`, `agent_id`, `assignment_id`, `strategy` |
| `Assignment.Rejected` | Agent declines an offer | `job_id`, `agent_id` |
| `Assignment.Revoked` | Dispatcher reassigns — prior accepted assignment revoked | `job_id`, `agent_id`, `assignment_id`, `superseded_by` |
| `Assignment.Unassigned` | No eligible agents found | `job_id`, `reason` |

Consumers: Field Execution (`Assignment.Accepted` → execution projection), Service Job Management (`Assignment.Accepted` → job status), Payouts (`Assignment.Accepted` → payout job projection), Customer Portal BFF (`Assignment.*` → read model).

## Field Service Execution — `serviq-field-service-execution-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Execution.CheckedIn` | Agent arrives on site | `job_id`, `agent_id` |
| `Execution.StepStarted` / `Execution.StepCompleted` | Workflow step transitions | `job_id`, `step_position`, `step_name` |
| `Execution.EvidenceCaptured` | Photo/signature/note/part recorded | `job_id`, `evidence_id`, `kind`, `step_position`, `object_ref` |
| `Execution.Completed` | Job execution finished | `job_id`, `agent_id` |

Consumers: Service Job Management (`Execution.*` → job lifecycle projection), AI Agent (`Execution.EvidenceCaptured` → async photo parse).

## Billing — `serviq-billing-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Invoice.Issued` | Invoice created (on `Job.Completed`) | `invoice_id`, `job_id`, `agent_id`, `amount_cents` |
| `Invoice.PaymentRecorded` | Payment lands on an invoice | `invoice_id`, `payment_id`, `method`, `evidence_id`, `under_remitted` |
| `Invoice.Remitted` | Dispatcher confirms remittance covers the invoice | `invoice_id`, `remittance_id` |
| `Invoice.Refunded` | Refund executed against a paid invoice | `invoice_id`, `refund_id`, `executed_by` |
| `PaymentEvidence.Received` | Evidence submitted (AI-parsed or manual) | `evidence_id`, `document_type`, `status`, `flags`, `invoice_id`, `uploader_id` |
| `PaymentEvidence.Reviewed` | Dispatcher accepts/rejects evidence | `evidence_id`, `decision`, `reviewed_by` |
| `Remittance.TurnInSubmitted` | Agent cash turn-in counted | `remittance_id`, `agent_id`, `expected_cents`, `counted_cents`, `variance_cents`, `invoice_ids`, `submitted_by` |
| `Remittance.BatchSubmitted` | Deposit-slip batch submitted | `remittance_id`, `evidence_id`, `reference`, `deposited_cents`, `expected_cents`, `invoice_ids`, `flags`, `submitted_by` |
| `Remittance.Confirmed` | Dispatcher confirms/overrides/shortfall-accepts | `remittance_id`, `kind`, `total_cents`, `confirmed_by`, `overridden_by` |
| `Remittance.ShortfallAccepted` | Turn-in shortage accepted | `remittance_id`, `agent_id`, `shortage_cents`, `accepted_by` |
| `Billing.RefundRequested` | Customer/staff requests a refund | `refund_request_id`, `invoice_id`, `reason` |
| `Billing.RefundRequestApproved` | Support decision → billing approves the request | `refund_request_id`, `invoice_id`, `decision_id`, `approved_by` |
| `Billing.RefundExecuted` | Gated refund execution completes | `refund_request_id`, `invoice_id`, `executed_by` |

Consumers: Payouts (`Invoice.*` → payout creation; `Remittance.*` → shortfall deduction; `Support.RefundDecided` bound — see gaps).

## Payouts — `serviq-payouts-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Payout.Created` | Agent payout computed on `Invoice.Issued` | `payout_id`, `job_id`, `agent_id`, `net_cents` |
| `Payout.Settled` | Payout disbursed via the disbursement port | `payout_id`, `disbursement_ref` |
| `Payout.ShortfallRecorded` | Turn-in shortfall → deduction ledger row | `payout_id`, `remittance_id`, `agent_id`, `shortage_cents` |

Consumers: none (projections only today).

## Customer Support — `serviq-customer-support-backend`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `Support.CaseOpened` | Case opened against a customer, job or invoice | `case_id`, `customer_id`, `job_id`, `invoice_id`, `subject`, `details` |
| `Support.CaseNoted` | Staff note/reply added to a case | `case_id`, `note_id`, `author_id`, `body` |
| `Support.CaseStatusChanged` | Case status moved (e.g. escalated, resolved) | `case_id`, `status`, `previous_status`, `changed_by` |
| `Support.RefundDecided` | Refund decision recorded (ADR-0004: Support decides, Billing executes) | `decision_id`, `case_id`, `invoice_id`, `amount_cents`, `reason`, `decided_by` |

Consumers: Billing (`Support.RefundDecided` → approves the matching refund request), support's own consumer (`Support.*` → Mongo read model), Payouts (bound — see gaps).

## AI Agent — `serviq-ai-agent`

| Event | Emitted when | Payload keys |
| --- | --- | --- |
| `AI.PaymentProofParsed` | Async consumer parsed an `Execution.EvidenceCaptured` photo | `job_id`, `evidence_id`, `object_ref`, `document_type`, `fields`, `confidence` |

Consumers: none yet — parsed data reaches Billing through the synchronous `/parse` and chatbot-tool paths today. See gaps.

---

## Consumer subscription map

| Consumer container | Bindings | Handles | Purpose |
| --- | --- | --- | --- |
| `identity-access-consumer` | `Platform.*` | `Platform.TenantCreated` | register tenant scope |
| `platform-management-consumer` | — | — | publisher only (`outbox:publish`) |
| `service-management-consumer` | — | — | publisher only |
| `customer-request-consumer` | — | — | publisher only |
| `service-job-consumer` | `Request.*`, `ServiceManagement.*`, `Assignment.*`, `Execution.*` | `Request.Submitted`, `ServiceManagement.ServiceCreated`, `ServiceManagement.WorkflowTemplateChanged`, `Assignment.Accepted`, `Execution.CheckedIn/StepStarted/StepCompleted` | job projections + lifecycle |
| `workforce-consumer` | — | — | publisher only |
| `assignment-dispatch-consumer` | `Job.*`, `Workforce.*` | `Job.ReadyForAssignment/Assigned/Accepted/Completed/Cancelled`, `Workforce.AgentRegistered/Updated` | dispatchable-job + agent projections; `offers:expire` sweeps TTLs |
| `field-service-consumer` | `Assignment.*`, `Job.*` | `Assignment.Accepted`, `Job.Requested`, `Job.WorkflowStepStarted/Completed` | execution projections |
| `customer-support-consumer` | `Support.*` (env `RABBITMQ_BINDINGS`) | own events | Mongo read-model upsert |
| `notification-consumer` | `#` | every event | channel-routed notifications (templates → in_app/email/…) |
| `billing-consumer` | `Job.*`, `Support.*` | `Job.Completed`, `Support.RefundDecided` | invoice issuance, refund-request approval |
| `payouts-consumer` | `Assignment.*`, `Invoice.*`, `Support.*`, `Remittance.*` | `Assignment.Accepted`, `Invoice.Issued`, `Remittance.ShortfallAccepted` (+`Support.RefundDecided` bound) | payout projection + deduction ledger |
| `customer-portal-bff-consumer` | `Request.*`, `Job.*`, `Assignment.*` | all matched | Mongo read model for the customer feed |
| `ai-agent-consumer` | `Execution.EvidenceCaptured` | photo-kind evidence only | fetch object → parse → emit `AI.PaymentProofParsed` |

Publisher-only services still run `outbox:publish` in their consumer container — the relay and the consumer share a unit by deployment convention, not because they subscribe.

## Known gaps and flags

- **`Support.RefundDecided` → Payouts:** bound and mapped to `PayoutEventHandler`, but the handler has no case for it — the refund-clawback deduction is unimplemented. The payload also lacks `agent_id`; resolving the agent needs a contract decision (enrich the event vs. an upstream API lookup).
- **`AI.PaymentProofParsed`:** emitted on every parsed evidence photo but has no domain consumer — only the notification fan-out sees it. Add a consumer (e.g. Billing auto-attaching parsed fields to evidence) or fold the flow into the sync `/parse` path deliberately.
- **`Identity.InvitationCreated` payload carries the raw accept token** — fine inside the broker boundary; strip or hash-and-lookup if event streams ever leave the cluster.
- **Naming drift:** `Invoice.*` and `Job.*` are entity-first while `Remittance.*`, `PaymentEvidence.*`, `Billing.*` are context-first. Both are live conventions today.
