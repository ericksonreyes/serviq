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
| Integration | cross-service flows over the real broker — emit → consume → project | `tests/integration/` (amqplib + pg) | running services + RabbitMQ |
| Eval | AI parse/extraction accuracy | `services/serviq-ai-agent/app/eval.py` | golden fixtures (stub mode, no weights) |
| Smoke | stack health after bring-up | `scripts/install.sh` stage 5, `verify_remittance.php` | running stack |
| Browser E2E | portal flows end-to-end | Playwright (already vendored for user-guide screenshots) | full stack |

## What exists today

- **`scripts/test.sh`** — the runner. Covers every service: phpunit in a PHP 8.4 container (composer dev-installs on demand, regenerates stale locks), `node --test` for Express services (their image on the compose network, throwaway DB), `unittest` for Python services, then the contract check. `./scripts/test.sh` for all, `./scripts/test.sh services/X` for one.
- **`scripts/contract-check.mjs`** — static contract check: every `request()` path in every frontend `api.js` must resolve to a real backend route. 53 calls, all green.
- **Feature suites** — real coverage through each service's HTTP kernel:
  - `identity-access`: register + invitation lifecycle + Tenant Administrator scope (18 tests) — create gate, show, accept, expired/replay, cross-tenant reads/writes
  - `billing`: remittance flows + evidence review + refund chain (15)
  - `payouts`: settle, shortfall deduction, idempotent replay, invoice absorption (6)
  - `service-job`: reschedule transition rules (5)
  - `dispatch`: offer accept/reject/expiry race-guard (7)
  - `customer-support`: cases/notes/transitions + refund decision outbox (6, node:test)
  - `ai-agent`: `/parse` stub contract + chat fallback (7, unittest)
- `services/serviq-billing-backend/verify_remittance.php` — 36-check smoke harness through the real HTTP kernel; pattern worth copying per service
- `services/serviq-ai-agent/app/eval.py` + `evals/dataset.jsonl` — 20-fixture parse-accuracy eval on stub mode
- `install.sh` smoke checks — `/api/health` on all 19 ports + frontends
- `tests/integration/` — broker-level suite (3 scripts, helpers in `lib/broker.mjs`): publishes envelopes onto the live `serviq.events` exchange so the real consumer containers handle them, then asserts on the owning services' databases and DLQs. Covers job→billing→payouts, refund decision → billing, shortfall → payouts, duplicate-delivery dedupe, DLQ on handler failure, invitation → notifications, photo evidence in MinIO → ai-agent → `AI.PaymentProofParsed` (and unfetchable evidence → `ai-agent.events.dlq`). Opt-in — `./scripts/test.sh tests/integration` — runs in `node:22-alpine` on the `serviq_serviq` network. Uses random tenant/job IDs (the invitation check uses the demo tenant so its email channel is exercised).
- `tests/e2e/` — Playwright persona suite (16 scripts, shared helpers in `lib/harness.mjs`); coverage per persona is listed in [TEST_SCENARIOS.MD](TEST_SCENARIOS.MD#portal-flows-browser-e2e). Opt-in — `./scripts/test.sh tests/e2e` runs them all flat; **`scripts/e2e.sh` runs them in the persona-ordered stage map below** with health gates, per-suite timing, and service-log tails on failure. Needs the running stack, not part of the default glob. Failure screenshots land as `tests/e2e/fail-*.png` (gitignored).
- `services/docker-compose.e2e.yml` — E2E overlay: pins the ai-agent services to `AI_*_PROVIDER=stub` so parse-dependent suites are deterministic regardless of the dev `.env`. Bring the stack up with `-f services/docker-compose.yml -f services/docker-compose.e2e.yml` before running the suite.

## Browser E2E run order

`scripts/e2e.sh` runs the suites in **persona-hierarchy order** — the same
order the product itself onboards: a tenant can't take bookings until
platform created it, services exist, and an agent accepted the invite.
The stage report reads like a product tour, and a failure at stage N
tells you the journey never had a chance rather than that everything is
broken.

| Stage | Suites | What it proves |
| --- | --- | --- |
| 0 — World *(only under `--fresh`)* | `bootstrap` | provider signup → platform activates → tenant configures → agent accepts invite → customer signs up — the onboarding story itself, on an empty database |
| 0 — Canary | `login-negatives` | health gates pass, auth + tenant-slug resolution work — 30s before opening the journey |
| 1 — Platform | `platform-admin`, `platform-admin-ops` | tenant lifecycle: create, approve/suspend, plans, flags, income |
| 2 — Tenant setup | `tenant-admin`, `invitations` | services/areas/roster CRUD; agent + customer invites issued (makes stage 3 possible) |
| 3 — Agent onboarding | *(covered inside `invitations` + agent legs of `customer-agent-lifecycle`)* | invite acceptance → agent portal login → jobs visible |
| 4 — Customer | `customer-self-service` | signup, address book, book/cancel, own notifications |
| 5 — Journey | `golden-chain`, `customer-agent-lifecycle` | book → convert → dispatch → execute → complete — the spine assembled from pieces 1–4 proved |
| 6 — Money | `cash-remittance`, `money-flows`, `transfer-remittance` | captures payment → remits: all rails, guardrails, reject |
| 7 — Dispatch ops | `dispatch-strategies`, `dispatch-ops`, `console-ops` | manual/broadcast/decline/expire/reassign — journey branches |
| 8 — Support | `support` | the fifth persona — cases, refund decisions feeding back into billing |
| 9 — AI surfaces | `chatbots` | per-persona chat tools — last because the AI dependency is flakiest even stubbed |

Runner flags: `--only <suite>` for iteration, `--fail-fast` to stop at
first failure, `--skip-health` when the stack is already verified up.
Suite files run sequentially — they share the seeded `acme` tenant and
parallelism would only buy minutes at a real debugging cost.

### Fresh-world mode

`./scripts/e2e.sh --fresh` proves the onboarding chain itself on an empty
database. The e2e overlay adds a dedicated `postgres-e2e` cluster
(`services/docker-compose.e2e.yml`) — every backend points there with
`SEED_DEMO=false`, so entrypoints create/migrate/seed **canonical data
only** (IAM permissions + platform admin, plans, feature flags,
locations, notification templates). No `acme`, no demo accounts —
dev `infra-postgres` is never touched.

`--fresh` wipes the `postgres-e2e` volume, brings the stack up, and runs
`bootstrap.mjs` first: the world is **built through the real UI flows**
(ADR-0030) — console `/signup` → platform admin activates → acme.admin
configures catalog/areas/invites the agent → agent accepts at her
portal → customer signs up. Identities match the seeded constants, so
the rest of the stage map runs unchanged. One documented exception:
company accounts are API-seeded — the console renders them read-only.

```bash
docker compose -f services/docker-compose.yml -f services/docker-compose.e2e.yml \
  --profile infra --profile domain --profile ai --profile frontends up -d
./scripts/e2e.sh --fresh        # wipe + bootstrap + full stage map
./scripts/e2e.sh                # same stack, world persists — rerun suites
./scripts/e2e.sh --only bootstrap   # validate/build the world standalone
```

## Browser E2E conventions

Established by the `tests/e2e` spike — follow these for new E2E tests:

- **Runtime is the official Playwright image** (`mcr.microsoft.com/playwright:v1.55.0-noble`) — `playwright` is an exact-pinned dev dep in `tests/e2e/package.json` (version must match the image's baked browsers; `^` resolves newer and breaks).
- **`--host-resolver-rules=MAP localhost <gateway>`** — frontends bake `VITE_* = localhost:PORT` for host browsers. Inside the container we remap the *browser's* localhost to `host.docker.internal` so page loads AND API calls land on host-mapped ports. Zero frontend config needed.
- **Tokens are in-memory only** (React state, no localStorage) — a `page.goto` reload loses auth. After login, all navigation is in-app clicks.
- **Tenant logins go through `/provider/{slug}/login`** — bare `/login` resolves platform scope and rejects tenant users.
- **IAM throttles login 5/min per client IP** — repeated runs share the container's IP; back off ~65s on "Too Many Attempts" rather than failing.
- **Drive the UI, not the API** — every lifecycle step now has a console control; only seed through an API when no UI exists, and record that as a product gap.
- **Projections are async** — after a write, re-enter the page (`reenter()` in the harness: navigate away and back) until the read model catches up; never `sleep` a fixed time.
- **Strategy-changing tests restore `automatic` in `finally`** — the other scripts assume instant auto-assignment for `acme`.
- **Match rows by your marker, not position** — bookings carry `E2E-<ts>` notes rendered in the console queue; the job lookup binds by `request_id`, not "first requested row" (stale leftovers poison positional matches).
- **Parse-dependent suites need the stub provider** — `AI_VISION_PROVIDER=stub`/`AI_TEXT_PROVIDER=stub` (the `.env.example` default). The fake "image" buffers carry `key: value` text the stub regex-extracts; a real provider (Ollama/Gemini) can't read them, so `cash-remittance.mjs` path B and `money-flows.mjs` path A are only deterministic in stub mode. `transfer-remittance.mjs` is provider-agnostic — when the parse returns nothing it falls back to manual entry and asserts the `claimed_mismatch` flag instead of the clean path.
- **Selectors: prefer role/label/text** — MUI labels resolve via `getByLabel`; Tailwind `<label>`s aren't `for`-associated (fall back to input types); hidden `<option>`s pollute `/status/i` text waits — match notice strings exactly.

## Environment quirks

- **Zero host runtimes.** `scripts/test.sh` needs only Docker — it derives the container from each manifest: `composer.json require.php` → `php:X.Y-cli` (that's how the `^8.3` → `^8.4` drift was caught: the lock's platform_check demanded ≥8.4.1), `package.json engines`/`@types/node` → `node:N-alpine` for repo scripts, and the service's own image for Node/Python suites (deps are baked there).
- **Stale composer locks.** Several services' `composer.lock` predates their dev-deps section — `test.sh` falls back to `composer update` when install fails, which rewrites the lock in place. Review lock diffs before committing.
- **Express services need real Postgres** — no sqlite substitute (TypeORM/pg). The node:test runner creates a throwaway `serviq_support_test` DB on the compose postgres; the stack must be up for node suites.
- **Stale-model hazard.** In feature tests, Eloquent objects held across HTTP calls go stale — `refresh()` before asserting or mutating after a request moved the row.
- **SQLite per service.** Feature tests use `DB_CONNECTION=sqlite` + a temp file — no shared test DB, no cross-service tables.
- **JWT in tests.** Laravel `JwtVerifier` falls back to HS256 when `JWT_JWKS_URL`/`JWT_PUBLIC_KEY` are empty; `JWT_SECRET` must be ≥32 bytes (see billing's `phpunit.xml`). Redis-unreachable is expected — the blacklist degrades to expiry-only validation.
- **No real secrets.** Test JWTs, demo accounts, and MinIO keys are local-only; never commit real credentials.
- **E2E-found product gaps.** The spike surfaced real defects, fixed where mechanical: frontend `.env` `VITE_API_BASE_URL` pointed at the frontends' own ports (all data calls returned vite's index.html); `tenant_scopes.slug` was NULL for pre-slug rows (handler now `updateOrCreate`); `DemoAgentSeeder` emitted no `Workforce.AgentRegistered` (dispatch agents projection stayed empty → every assign "invalid agent") and never linked `user_id` (BFF couldn't resolve IAM sub → workforce id — new `agents?user_id=` filter + `resolveAgentId` in the agent BFF). Later fixed: console Confirm / Mark-ready controls and an Assignment-strategy setting (dispatcher/broadcast now testable); Job Management ignored `Execution.Completed` (jobs stuck `in_progress`, no invoice, no feedback); Field Service dropped workflow steps when `Job.Requested` arrived before the execution existed, and ignored `Job.Cancelled` (cancelled jobs stayed on the agent's list); Support's case list returned Mongo `_id` without `id`, and a malformed case id crashed the process; IAM's `Invitation` model was never committed (invites 500'd) and Tenant Administrator held no permissions. **Still open:** nothing records a cash payment, so agent turn-in and remittance confirmation can't run end to end.

## Documents

- [Test Plan](TEST_PLAN.MD) — layer-by-layer strategy, per-service matrix, coverage priorities, CI proposal
- [Test Scenarios](TEST_SCENARIOS.MD) — the business flows to automate, with preconditions and assertions
