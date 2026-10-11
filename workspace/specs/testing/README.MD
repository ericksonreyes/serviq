# Testing

Test strategy, scenario inventory, and run instructions for the ServIQ stack. This is the plan to grow automated coverage — not a claim about what exists today.

## What belongs here

- the test pyramid as it maps onto this codebase (what layer covers what)
- the scenario inventory: business flows that must stay green
- how to run what exists today, and the environment quirks

## Test pyramid for this stack

| Level | Scope | Tooling | Runs against |
| --- | --- | --- | --- |
| Unit | one class/function, no DB | PHPUnit, pytest, vitest | code |
| Feature/API | one service through its HTTP kernel — auth, tenant scope, validation, state, outbox rows | PHPUnit `TestCase` (sqlite), supertest (Express), FastAPI `TestClient` | service + sqlite |
| Contract | event payload shape + handler compatibility; BFF path→upstream mapping | schema asserts in feature tests | code + [event catalog](../domain/specs/domain_events/EVENT_CATALOG.MD) |
| Integration | cross-service flows over the real broker — emit → consume → project | compose test profile | running services + RabbitMQ |
| Eval | AI parse/extraction accuracy | `services/serviq-ai-agent/app/eval.py` | golden fixtures (stub mode, no weights) |
| Smoke | stack health after bring-up | `scripts/install.sh` stage 5, `verify_remittance.php` | running stack |
| Browser E2E | portal flows end-to-end | Playwright (already vendored for user-guide screenshots) | full stack |

## What exists today

- **`scripts/test.sh`** — the runner. Covers every service: phpunit in a PHP 8.4 container (composer dev-installs on demand, regenerates stale locks), `node --test` for Express services (their image on the compose network, throwaway DB), `unittest` for Python services, then the contract check. `./scripts/test.sh` for all, `./scripts/test.sh services/X` for one.
- **`scripts/contract-check.mjs`** — static contract check: every `request()` path in every frontend `api.js` must resolve to a real backend route. 53 calls, all green.
- **Feature suites** — real coverage through each service's HTTP kernel:
  - `identity-access`: register + invitation lifecycle (13 tests) — create gate, show, accept, expired/replay, cross-tenant
  - `billing`: remittance flows + evidence review + refund chain (13)
  - `payouts`: settle, shortfall deduction, idempotent replay, invoice absorption (6)
  - `service-job`: reschedule transition rules (5)
  - `dispatch`: offer accept/reject/expiry race-guard (7)
  - `customer-support`: cases/notes/transitions + refund decision outbox (6, node:test)
  - `ai-agent`: `/parse` stub contract + chat fallback (7, unittest)
- `services/serviq-billing-backend/verify_remittance.php` — 36-check smoke harness through the real HTTP kernel; pattern worth copying per service
- `services/serviq-ai-agent/app/eval.py` + `evals/dataset.jsonl` — 20-fixture parse-accuracy eval on stub mode
- `install.sh` smoke checks — `/api/health` on all 19 ports + frontends

## Environment quirks

- **Zero host runtimes.** `scripts/test.sh` needs only Docker — it derives the container from each manifest: `composer.json require.php` → `php:X.Y-cli` (that's how the `^8.3` → `^8.4` drift was caught: the lock's platform_check demanded ≥8.4.1), `package.json engines`/`@types/node` → `node:N-alpine` for repo scripts, and the service's own image for Node/Python suites (deps are baked there).
- **Stale composer locks.** Several services' `composer.lock` predates their dev-deps section — `test.sh` falls back to `composer update` when install fails, which rewrites the lock in place. Review lock diffs before committing.
- **Express services need real Postgres** — no sqlite substitute (TypeORM/pg). The node:test runner creates a throwaway `serviq_support_test` DB on the compose postgres; the stack must be up for node suites.
- **Stale-model hazard.** In feature tests, Eloquent objects held across HTTP calls go stale — `refresh()` before asserting or mutating after a request moved the row.
- **SQLite per service.** Feature tests use `DB_CONNECTION=sqlite` + a temp file — no shared test DB, no cross-service tables.
- **JWT in tests.** Laravel `JwtVerifier` falls back to HS256 when `JWT_JWKS_URL`/`JWT_PUBLIC_KEY` are empty; `JWT_SECRET` must be ≥32 bytes (see billing's `phpunit.xml`). Redis-unreachable is expected — the blacklist degrades to expiry-only validation.
- **No real secrets.** Test JWTs, demo accounts, and MinIO keys are local-only; never commit real credentials.

## Documents

- [Test Plan](TEST_PLAN.MD) — layer-by-layer strategy, per-service matrix, coverage priorities, CI proposal
- [Test Scenarios](TEST_SCENARIOS.MD) — the business flows to automate, with preconditions and assertions
