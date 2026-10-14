# App Features by Portal

This file is the canonical inventory of ServIQ features, organized by user-facing portal (channel). Each feature is marked:

- ✅ — implemented: working code exists in `services/` today, end-to-end where the feature spans a frontend and backend (UI wired to live APIs, not a scaffold or mock)
- No mark — proposed: specified in the domain/persona/AI specs but not yet built

Sources: [Personas](workspace/specs/domain/specs/PERSONAS.MD), [Domain Boundaries](workspace/specs/domain/specs/DOMAIN_BOUNDARIES.md), [Agent Profiles](workspace/specs/technical/ai/AGENT_PROFILES.MD), and the frontend scaffolds under `services/`.

## Portal Map

| Portal | Personas served | Frontend | Backend edge |
| --- | --- | --- | --- |
| Customer Portal | Customer | `serviq-customer-portal-frontend` (React + MUI) | Customer Portal BFF (Express + MongoDB read model) |
| Service Agent Portal | Service Agent | `serviq-service-agent-frontend` (React PWA + MUI) | Service Agent BFF (Express, real-time queries to command APIs) |
| Tenant Console | Tenant Administrator, Dispatcher, Customer Support | `serviq-tenant-console-frontend` (React + Tailwind) | Command APIs directly |
| Platform Admin Console | Platform Administrator | `serviq-platform-admin-frontend` (React + Tailwind) | Platform Management + Identity & Access APIs |

---

## Customer Portal

Customer-facing app for a Service Provider — signup, browsing, booking, tracking, self-service.

- ✅ Landing page — ServIQ overview with public provider directory search (debounced autocomplete)
- ✅ Provider homepage (`/provider/:slug`) — provider name/description with sign-in and signup entry points
- ✅ Tenant-scoped signup and login (`/provider/:slug/signup`, `/provider/:slug/login`)
- ✅ Refresh-token sessions — access tokens rotate silently via `POST /auth/refresh`; "Keep me signed in" persists the session across restarts; sign-out revokes both tokens
- ✅ Home view listing the customer's service requests and jobs via the BFF read model
- ✅ Customer onboarding by Service Provider invitation — staff create the customer account; first sign-in links it
- ✅ Customer account and profile management, including address book
- ✅ Service catalog browsing and discovery
- ✅ Service request submission and booking with availability-aware schedule selection — calendar date picker enables only bookable days (closures struck through with reason); hourly start-time list disables hours with no agent coverage; provider business hours, upcoming closures, and cancellation policy shown inline. Factors: provider-set business hours/days (incl. 24/7), holidays, non-working days, and projected agent schedules (Workforce events). The chosen schedule is re-validated server-side at request creation (ADR-0025)
- ✅ Customer-facing request status tracking (received → technician assigned → en route → started → completed)
- ✅ Notifications and self-service updates
- ✅ Feedback / review after completion
- ✅ Customer Chatbot (AI Agent, Customer profile):
  - ✅ `service_availability` — check schedulable dates
  - ✅ `service_request_status` — look up own request status
  - ✅ `service_request_create` — create a request via chat
  - ✅ `service_request_cancel` — policy-gated cancellation
  - ✅ `complaint_file` — file a complaint or support case
  - ✅ `proof_of_payment_upload` — submit payment evidence for AI parsing
  - ✅ `refund_request` — request a refund

## Service Agent Portal

Field agent PWA — mobile-first channel for executing field work.

- ✅ Signup and login
- ✅ Refresh-token sessions — silent access-token renewal; "Keep me signed in" persists across restarts; sign-out revokes both tokens
- ✅ Home view showing today's assignments via the Service Agent BFF
- ✅ Onboarding by dispatcher invitation — dispatcher/admin creates the agent account
- ✅ Accept / reject assignments
- ✅ Job list and job detail views
- ✅ Navigation to the customer location
- ✅ Job status updates (check-in → steps → complete)
- ✅ Field notes
- ✅ Photo / evidence upload
- ✅ Parts and materials recording
- ✅ Proof of payment upload for digital payments — the AI Agent parses the receipt and extracts the amount and reference number ([Proof of Payment Parsing](workspace/specs/technical/ai/PROOF_OF_PAYMENT_PARSING.MD))
- ✅ Record cash collected on a completed job (Billing records the cash payment against the job's invoice)
- ✅ Cash turn-in at end of shift — the agent's list of cash-paid services reconciled with the dispatcher ([Cash Remittance Counting](workspace/specs/technical/ai/CASH_REMITTANCE.MD))
- ✅ Remit cash by over-the-counter deposit — upload the bank deposit slip or remittance-center receipt; the AI Agent reads amount + reference, Billing validates the deposit batch and a dispatcher confirms
- ✅ Customer confirmation capture (typed-name signature evidence)
- ✅ Job completion

## Tenant Console

Internal console for a Service Provider's staff — Tenant Administrator, Dispatcher, and Customer Support views (role-scoped).

- ✅ Signup and login
- ✅ Refresh-token sessions — silent access-token renewal; "Keep me signed in" persists across restarts; sign-out revokes both tokens
- ✅ Tenant-scoped signup and login (`/provider/:slug/...`)
- ✅ Home view showing the signed-in user's identity, tenant, roles, and permissions

### Tenant Administrator

- ✅ Manage tenant users and assign dispatcher permissions
- ✅ Invite Service Agents and customers by email
- ✅ Add / remove Service Agents
- ✅ Create service types and configure the service catalog
- ✅ Configure pricing
- ✅ Configure service areas
- ✅ Manage business settings and operational workflows — per-day operating hours editor with 24-hour option, crews fallback capacity, recurring holidays, one-off non-working days, cancellation policy, payment/auto-broadcast flags
- ✅ Choose the assignment strategy (automatic, broadcast, self, dispatcher) and broadcast offer TTL
- ✅ View reports
- ✅ Review revenue, invoices, refunds, and payout status

### Dispatcher

- ✅ Review incoming service requests
- ✅ Check customer location and available agents
- ✅ Schedule appointments
- ✅ Confirm jobs and release them for assignment
- ✅ Assign Service Agents to jobs (manual assignment)
- ✅ Monitor active jobs
- ✅ Reschedule and reassign jobs
- ✅ Cancel jobs mid-flight (drops off the agent's active list)
- ✅ Manage the dispatcher queue
- ✅ Cash turn-in reconciliation (end-of-shift closure) — list the agent's cash-paid services, photograph the laid-out bills and coins; the AI Agent counts denominations and Billing reconciles expected vs counted — confirmed matches mark tickets remitted, variances are recount/overridden or accepted as a shortfall ([Cash Remittance Counting](workspace/specs/technical/ai/CASH_REMITTANCE.MD))
- ✅ Mark validated digital payments as remitted — e-wallet receipts parsed by the AI Agent
- ✅ Batch remittance of deposited cash — upload the bank deposit slip, the AI Agent extracts its reference number and amount, and the covered cash collections are collectively marked remitted
- ✅ Duplicate reference-number detection across transactions and batches — fraud guard on payment evidence ([Proof of Payment Parsing](workspace/specs/technical/ai/PROOF_OF_PAYMENT_PARSING.MD))
- ✅ Manual review of anomalous or flagged payment and remittance records for operational compliance
- ✅ Dispatcher Chatbot (AI Agent, Dispatcher profile):
  - ✅ `service_request_search` — search the tenant request queue
  - ✅ `service_agent_search` — find agents by skill, availability, service area
  - ✅ `repair_guide_search` — RAG over curated repair guides
  - ✅ `dispatch_recommend` — advisory top-N agent recommendations
  - ✅ `cash_turnin_count` — count photographed cash during turn-in
  - ✅ `remittance_evidence_upload` — submit remittance evidence (e.g. bank deposit slip) for parsing

### Customer Support

- ✅ Open support cases against a customer, job, or invoice
- ✅ Review and respond to complaints and support cases
- ✅ Follow up on service issues and escalate
- ✅ Review refund requests and approve or reject them (Billing executes the payment)
- ✅ View invoices, payments, and expected-vs-remitted revenue for context
- ✅ Customer Support Chatbot (AI Agent, Customer Support profile) — see [Agent Profiles](workspace/specs/technical/ai/AGENT_PROFILES.MD) for its tool registry

## Platform Admin Console

Internal console for ServIQ platform operators — sits above the tenant boundary.

- ✅ Login
- ✅ Refresh-token sessions — silent access-token renewal; "Keep me signed in" persists across restarts; sign-out revokes both tokens
- ✅ Home view listing tenants (name, slug, status, tenant ID) via the Platform Management API
- ✅ Create and manage Service Providers (tenants)
- ✅ Approve or suspend businesses (tenant lifecycle)
- ✅ Manage subscription plans and subscriptions
- ✅ Manage platform-wide configuration and platform policies
- ✅ Manage feature flags
- ✅ Manage platform users and permissions
- ✅ View platform-wide metrics
- ✅ Review tenant income, platform fee income, and settlement status

---

## Related Documentation

- [Workspace Specs](workspace/specs/README.MD)
- [Project Purpose](workspace/specs/PROJECT_PURPOSE.MD)
- [Personas](workspace/specs/domain/specs/PERSONAS.MD)
- [Domain Boundaries](workspace/specs/domain/specs/DOMAIN_BOUNDARIES.md)
- [Agent Profiles](workspace/specs/technical/ai/AGENT_PROFILES.MD)
- [Build Sequence](workspace/specs/BUILD_SEQUENCE.MD)
- [SERVICE_MAP.md](SERVICE_MAP.md)
