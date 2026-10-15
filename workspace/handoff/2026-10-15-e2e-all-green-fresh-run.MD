# Handoff — 2026-10-15 — E2E suite fully green on a clean `--fresh` run

## Done This Session

- **All 16 E2E suites pass on `./scripts/e2e.sh --fresh`** (wiped DB → bootstrap builds the world via real UI → all personas). ~12 min suite time.
- Auth pacing + per-persona JWT reuse — `tests/e2e/lib/harness.mjs` (`paceAuth`, `cachedToken`/`stashToken`); cache in `tests/e2e/.runtime/` (gitignored, wiped on `--fresh` by `scripts/e2e.sh`).
- Runner streams live progress (`✓`/throttle/pacing/reused/error lines) via `tee`+`grep` in `run_suite()`.
- **Product bugs found & fixed:**
  - `Settings.jsx` — StrictMode double-mount fired two `dispatchRules`/`settings` GETs; late fetch clobbered user selection → PUTs sent `automatic` → consumer auto-assigned jobs the suite meant to assign manually → 409 loop. Fixed with `cancelled` flag in both loaders.
  - `ServiceDetail.jsx` — `price_type` sent `fixed`/`estimate`; backend validates `flat|hourly|quote` → 422 → 'Pricing saved.' never showed. Fixed option values + converted `useState(() => fetch)` → `useEffect` + cancel guard.
  - `invitations.mjs` — pending-org admin login raced `TenantCreated` provisioning; spec says admin CAN sign in → poll login ~60s until scope+user land.
  - Earlier session: IAM default permissions on signup/invite-accept; Billing RLS middleware ordering (`SetTenantContext` before `SubstituteBindings`); remittance batches → `billing.payments.record`; support backend `_id→id` + uuid guard (rebuilt stale image); AI agent SUPPORT_URL port + availability default window + chat booking address reuse.

## Current State

- E2E system is green end-to-end and self-provisioning; throttle-safe; ~2× faster via JWT injection (login form still exercised once per persona per world).
- `services/` diffs are uncommitted — IAM `Role::syncDefaultPermissions` + callers, billing middleware/routes, support `app.ts`, dispatch controller untouched after temp-log revert, `Settings.jsx`, `ServiceDetail.jsx`, `tools.py`, compose env fixes, all `tests/e2e/*` changes.

## Decisions Made

- Keep prod throttle limits (5/min) — tests pace + reuse tokens rather than weakening limiter config.
- `price_type` canonical = `flat|hourly|quote` (migration + backend validation) — frontend conformed.
- Pending-tenant org admin CAN sign in (spec: admin provisioned via `TenantCreated`); test polls, never asserts rejection.
- `awaitRule` readback after every strategy save — clobbered saves fail loudly at the write step.

## Next Steps

- Commit the accumulated changes (many files across `services/` + `tests/e2e/`).
- Optional: audit remaining `useEffect`-fetch-into-form patterns for the same clobber class (broad sweep list exists — only edit forms matter).
- Re-run `--fresh` periodically; the suite is now the regression gate.

## Key Files

- `tests/e2e/lib/harness.mjs` — auth pacing, JWT cache, shared flow helpers.
- `tests/e2e/dispatch-strategies.mjs` — setStrategy + awaitRule readback pattern.
- `services/serviq-tenant-console-frontend/src/pages/admin/Settings.jsx` — StrictMode-safe loaders.
- `services/serviq-tenant-console-frontend/src/pages/admin/ServiceDetail.jsx` — price_type contract.
- `scripts/e2e.sh` — `--fresh`, `--only`, `--fail-fast`, `--skip-health`; live progress streaming.
