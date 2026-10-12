# Handoff — 2026-10-11 — E2E persona suite

## Done This Session

- Console job lifecycle UI: **Confirm job** / **Mark ready for assignment** on the job detail (`serviq-tenant-console-frontend/src/pages/dispatch/Jobs.jsx`); `golden-chain.mjs` no longer seeds those transitions via API.
- Console **Assignment strategy** setting (`pages/admin/Settings.jsx`) backed by `GET/PUT /tenants/{tenant}/dispatch/rules` in Assignment & Dispatch; console **Open case** intake for Support (`pages/support/Cases.jsx`).
- Persona E2Es in `tests/e2e/` on shared helpers `lib/harness.mjs`: `customer-agent-lifecycle`, `dispatch-strategies`, `tenant-admin`, `support`, `platform-admin`, `login-negatives` (plus existing `golden-chain`). Coverage map: [TEST_SCENARIOS.MD](../specs/testing/TEST_SCENARIOS.MD#portal-flows-browser-e2e).
- Product bugs the E2Es caught, fixed with service tests:
  - Job Management ignored `Execution.Completed` → jobs stuck `in_progress`, no invoice, no feedback (`ExecutionEventHandler`, `ExecutionCompletedTest`).
  - Field Service dropped workflow steps arriving before the execution existed → new `job_workflows` table seeds on `Assignment.Accepted` (`WorkflowSeedTest`).
  - Field Service ignored `Job.Cancelled` → cancelled jobs stayed on the agent's active list; execution now goes `cancelled`, agent Home hides it.
  - IAM `App\Models\Invitation` was missing (invites 500'd); Tenant Administrator had no permissions → granted `iam.users.read`, `iam.users.manage`, `iam.roles.read` (migration `2026_10_11_000002_…` + `TenantCreatedHandler`), user/role lists default to the caller's tenant (`TenantAdministratorScopeTest`). Approved by the user.
  - Support: case list returned Mongo `_id` only (console requested case `undefined`) and a malformed id crashed the Node process → `id` alias + `api.param('case')` uuid guard.
  - Support never created `serviq_support` on a fresh Postgres → `ensureDatabase()` in `src/db.ts`.
  - Agent BFF `AI_URL` pointed at `ai-agent:80` (uvicorn listens on 8000) → every agent upload silently skipped AI parsing; fixed in `.env.example` + default.
  - Agent BFF crashed on any async upstream error (Express 4) → async handlers now route to a 502 error handler.
  - Agent `/me/jobs` fanned out 2 requests per execution in parallel (60+ with test leftovers) and OOM-killed the 128MB Customer Request Apache → bounded fan-out (`mapLimit`, 4) and optional reads (`get`) degrade to null on network errors.
  - `golden-chain.mjs` bound to stale `requested` leftovers before the new job projected → re-enters the Jobs monitor until this request's job appears.
- Cash remittance (user-approved): agent **Collected cash** on a completed job → BFF `POST /executions/:id/cash-collected` → Billing `POST /invoices/{id}/pay` (`method: cash`), invoice found via new `?job_id=` filter.
- Over-the-counter deposit (user-requested): agent Cash turn-in page uploads a bank deposit slip or **remittance-center receipt** → BFF `POST /remittances/deposits` → AI Agent parse → Billing evidence → existing deposit batch (`/remittances/batches`). New evidence type `REMITTANCE_RECEIPT` in Billing, AI parser, and [PROOF_OF_PAYMENT_PARSING.MD](../specs/technical/ai/PROOF_OF_PAYMENT_PARSING.MD). E2E `cash-remittance.mjs` covers both paths + dispatcher confirmation.

## Current State

- All work **uncommitted** on `devin/feature/full-features`.
- `node_modules.corrupt-20261011` in the Customer Portal BFF is a renamed corrupt install — safe to delete manually.

## Decisions Made

- Tenant Administrator IAM permissions are tenant-scoped grants, not platform ones — user approved.
- E2Es drive the UI only; projection lag is handled by re-entering pages, not fixed sleeps.
- Deposits reuse Billing's deposit-batch model instead of a new endpoint — Billing already owns duplicate-reference and under-remitted checks.
- The BFF only lets an agent cover their own pending cash collections (checked against `/remittances/expected`); typed reference/amount are a fallback, AI-read values win.

## Next Steps

Closed in the follow-up pass (same day):
- Customer Portal BFF: async route rejections → 502 handler; API no longer runs the projector in-process (read side connects Mongo only — projection stays in `customer-portal-bff-consumer`); projector reconnects with backoff on boot-time `ECONNREFUSED` and dropped connections (the consumer container had been dead since boot, so the customer read model wasn't projecting).
- Dispatch recommend/assign/broadcast on a job not yet projected → 404 with "This job has not reached dispatch yet … Try again shortly." (stays 404 — no existence leak). Test in `OfferFlowTest`.
- `tests/integration/` broker suite (3 scripts) — see testing README. Found + fixed: ai-agent queue was declared without dead-lettering, so failed parses were dropped; consumer now declares DLX args and recreates the legacy queue only when empty.

Still open:
1. Fixed: ai-agent (`MINIO_ROOT_PASSWORD`) and field-service (`AWS_SECRET_ACCESS_KEY`) env had blank MinIO secrets vs the compose default `serviq-local` → `SignatureDoesNotMatch`. Local `.env`s and both `.env.example` templates now carry `serviq-local`; `ai-evidence.mjs` covers the happy path. A `.env` copied from the old template still needs the value.
2. Outbox atomicity (kill mid-request) and event-catalog contract checks remain unautomated.
3. amqplib < 0.10.9 defaults to frame_max 4096, which RabbitMQ 4 rejects — pin ≥ 0.10.9 or pass `?frameMax=` (the integration harness does the latter).

## Key Files

- [TEST_SCENARIOS.MD](../specs/testing/TEST_SCENARIOS.MD), [testing README](../specs/testing/README.MD)
- `tests/e2e/lib/harness.mjs`
