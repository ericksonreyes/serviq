# Handoff — 2026-10-15 — Billing RLS, remittance audit events, transfer-rail E2E coverage

## Done This Session

- **Postgres Row-Level Security, Billing showcase** ([ADR-0028](../specs/decisions/0028-billing-row-level-security.MD)) — `ENABLE` + `FORCE` + tenant/is_system policies on all tenant-bearing Billing tables (`2026_10_21_000001_row_level_security.php`); `SetTenantContext` middleware pins `app.tenant_id` from the verified JWT; `AppServiceProvider` sets `app.is_system` on `CommandStarting` for console paths; new non-superuser role `serviq_app` (`services/postgres/init/01-app-roles.sql`) wired as `DB_USERNAME` for `billing-backend` + `billing-consumer` in compose; `.env.example` updated. Verified live: no-GUC → 0 rows, tenant GUC → tenant's rows, `is_system` → all, cross-tenant INSERT → policy violation, HTTP API serves normally. `TenantIsolationTest` skips on sqlite by design.
- **`Remittance.Rejected` event + richer `Remittance.Confirmed`** — rejection now emits an event (it previously only mutated state); confirmation carries `decision`/`decision_notes`/`variance_cents`/`flags`/channel/reference/evidence/actor fields. Event catalog updated (77/77).
- **Recipient-guardrail fixes** — `claimed.recipient` compares against `recipient_name` *or* `recipient_account` (was name-only → false `claimed_mismatch`); claimed recipients now checked against `company_accounts` too (closed the unparseable-receipt + typed-wrong-recipient bypass).
- **New E2E suite `tests/e2e/transfer-remittance.mjs`** — agent e-wallet turn-in, dispatcher bank turn-in with inline AI parse, receipt popup (MinIO artifact), wrong-recipient flag → confirm refusal → reject → expected-total release. Provider-agnostic: falls back to manual dispatcher entry when the AI can't parse the fake slip. **Written, not run.**
- **`convert()` race fix** — Service Request Management's request→job conversion now `lockForUpdate`s the request row in a transaction; closes the double-`Request.Converted` race (two jobs for one request).
- Docs: PROJECT_PURPOSE security row, security/README "Tenant Isolation in Depth", technical/README, root README bullet, billing README RLS section, TEST_SCENARIOS rows, testing/README stub note.

## Current State

- Billing suite green: 38 tests / 212 assertions (2 RLS tests skip on sqlite — intended). Contract check clean.
- Live stack: RLS active on `serviq_billing`, `serviq_app` provisioned, containers recreated, consumer + outbox relay healthy under `is_system`.
- Large uncommitted working tree (~104 files) spanning multiple prior sessions — not committed, per repo rules.
- E2E suite `transfer-remittance.mjs` is written but has never run; live stack AI is on Gemini, and its parse assertions branch on provider.

## Decisions Made

- **RLS = net, not mechanism** — JWT claim + `where(tenant_id)` + permission gates stay first-class; RLS only fails-closed a forgotten scope. One-line why: portfolio value is layered defense, and RLS can't express roles/permissions anyway.
- **Permissive, not RESTRICTIVE policies** — a table whose only policy is restrictive denies all rows (restrictive narrows permissive grants; doesn't grant). Caught live; docs describe the real shape.
- **`serviq_app` member-of-`serviq` role** — superusers bypass RLS unconditionally, so a bound runtime role was mandatory; membership inherits table privileges so one password serves migrations + runtime.
- **`SET` (session) GUC, not `SET LOCAL`** — Laravel doesn't wrap every query in a transaction; FPM's one-request-per-connection + middleware-before-query makes session SET safe. Documented in ADR-0028.
- **Billing-only slice** — demonstration value saturates at one service; rollout is mechanical when another service's blast radius justifies it.
- **`convert()` guarded by row lock, not status check** — same pattern as billing settle paths; serializes double-click into one event + one 409.

## Next Steps

1. Commit the work in logical batches if the user asks (AI-provider refactor, remittance rails + audit events, RLS, frontend rework, E2E suite, docs) — nothing committed yet.
2. Run the new E2E suite only if asked — needs `AI_*_PROVIDER=stub` for the parse-assertion paths, or runs provider-agnostic via the manual-entry fallback.
3. If desired, run `TenantIsolationTest` against Postgres explicitly (it self-skips on sqlite) — the psql probes already proved the behavior.
4. Same race-audit pattern may apply to other check-then-act transitions (request cancel, job status moves) — flagged, not audited.

## Key Files

- [ADR-0028](../specs/decisions/0028-billing-row-level-security.MD) — the RLS decision, layer model, role/GUC rationale
- `services/serviq-billing-backend/database/migrations/2026_10_21_000001_row_level_security.php` — policies
- `services/serviq-billing-backend/app/Support/TenantContext.php`, `app/Http/Middleware/SetTenantContext.php`, `app/Providers/AppServiceProvider.php` — context plumbing
- `services/postgres/init/01-app-roles.sql`, `services/docker-compose.yml` (billing env), `services/serviq-billing-backend/.env.example` — `serviq_app` provisioning/wiring
- `tests/e2e/transfer-remittance.mjs`, `workspace/specs/testing/TEST_SCENARIOS.MD` — new coverage + stubs caveat
- `services/serviq-customer-request-management-backend/app/Http/Controllers/ServiceRequestController.php` — `convert()` lock
- `workspace/specs/technical/security/README.MD`, `PROJECT_PURPOSE.MD`, root `README.MD`, `services/serviq-billing-backend/README.MD` — showcase surfaces
