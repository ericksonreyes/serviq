# Build Sequence

The order in which services should be implemented — driven by dependency, not by preference.
Each phase ends at a **demonstrable milestone**, so the portfolio has a working story at every
step, not only at the end.

Rules of thumb behind the ordering:

- nothing works without auth → IAM first;
- nothing is scoped without tenants → Platform Management second;
- follow the core flow (request → job → assign → execute → bill → payout);
- edges and AI come last — they aggregate what already exists;
- each service's `*-consumer` container and `services/docker-compose.yml` entry are
  uncommented **in the same change** as its Dockerfile (see `AGENTS.md`).

## Phase 0 — Foundation (done)

- `services/docker-compose.yml`, infra profile, `scripts/install.sh`, env templates.
- Specs, ADRs, audit, service map.

## Phase 1 — Platform spine

1. **Identity & Access** (`serviq-identity-access-backend`) — JWT RS256 issuance, users,
   roles, credentials. Everything else validates against its public key. Seed a system
   tenant + platform admin user directly (provisioning isn't self-serve yet).
   *Milestone: issue a token, validate it — auth exists.*
2. **Platform Management** (`serviq-platform-management-backend`) — tenant lifecycle,
   plans/subscriptions; emits `Platform.TenantCreated` → IAM binds users to `tenant_id`.
   *Milestone: create a tenant, provision a tenant admin, log in as them.*

## Phase 2 — Domain spine (the request→job path)

3. **Service Management** (`serviq-service-management-backend`) — tenant service catalog +
   workflow step templates (jobs instantiate these).
4. **Customer & Request Management** (`serviq-customer-request-management-backend`) —
   customers, requests; `Request.Submitted` is the first real domain event on the bus.
   *Milestone: POST a request → see the event in RabbitMQ management UI.*
5. **Service Job Management** (`serviq-service-job-management-backend`) — first
   event-sourced service; job lifecycle `JobRequested → … → JobCompleted`; two-layer events
   (fixed lifecycle + generic step events).
   *Milestone: request → job via event; replay the stream to rebuild job state.*

## Phase 3 — Operations spine

6. **Workforce Management** (`serviq-workforce-management-backend`) — agents, availability,
   rosters. Dispatch can't route to agents that don't exist.
7. **Notification** (`serviq-notification-backend` + `notification-consumer`) — first pure
   event consumer; proves the bus works end-to-end; templates on `{{step_name}}`.
   *Milestone: a domain event produces a stored notification — the EDA story is visible.*
8. **Assignment & Dispatch** (`serviq-assignment-dispatch-backend` + consumer) — the three
   assignment strategies (automatic / dispatcher / self-assign), broadcast offers, tiered
   timeouts, conditional-accept race handling.
9. **Field Service Execution** (`serviq-field-service-execution-backend`) — agent-side job
   execution, evidence uploads to MinIO.
   *Milestone: request → job → offer → accept → execute → complete. The operational loop
   closes.*

## Phase 4 — Money

10. **Billing** (`serviq-billing-backend` + consumer) — event-sourced; invoices off
    `Job.Completed`, payment evidence intake, remittance, refund *execution*.
11. **Payouts** (`serviq-payouts-backend` + consumer) — agent payout lifecycle, shortfall
    deductions (ADR-0005), payout-port stub adapter.
12. **Customer Support** (`serviq-customer-support-backend`) — cases, complaints, refund
    *decisions* (ADR-0004); needed for the refund decision→execution split demo.
    *Milestone: JobCompleted → invoice → payment → payout; complaint → refund decision →
    Billing executes. The money loop closes.*

## Phase 5 — AI

13. **AI Agent** (`serviq-ai-agent` + `ai-agent-consumer`) — document parsing into Billing's
    evidence API, cash counting, RAG tools. Constrained boundary (ADR-0003); models are env
    config (ADR-0012). Build the **eval set** (~20 sample docs + expected JSON) alongside —
    it's a deliverable, not an afterthought.
    *Milestone: upload a receipt photo → structured JSON → Billing accepts/flags it.*

## Phase 6 — Edges

14. **Customer Portal BFF** (`serviq-customer-portal-bff` + consumer) — NestJS + MongoDB
    read model; projector consumes `Job.*`, `Request.*` into the portal read store.
15. **Service Agent BFF** (`serviq-service-agent-bff`) — aggregation edge for the field app;
    no read model.

## Phase 7 — Channels (UI last)

16. **Customer Portal** (`serviq-customer-portal-frontend`, MUI)
17. **Service Agent** (`serviq-service-agent-frontend`, MUI, PWA)
18. **Tenant Console** (`serviq-tenant-console-frontend`, Tailwind) — highest-surface app:
    admin, dispatch, support, finance views
19. **Platform Admin** (`serviq-platform-admin-frontend`, Tailwind)
    *Milestone: `docker compose --profile full up -d` — the whole platform, end to end, on
    one laptop.*

## What this ordering buys

- Every phase produces something demonstrable — no "build 12 backends before anything works."
- The hardest patterns land early: JWT propagation (P1), domain events (P2), event sourcing
  (P2), consumers (P3), real-time (P3) — so late phases compose proven mechanics.
- UI comes last because it aggregates APIs — channels are cheap once the edges exist.
