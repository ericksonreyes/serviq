# Platform Management Backend — implemented (Phase 1.2)

Date: 2026-10-09
Status: implemented + verified live, uncommitted (per repo convention)

## What was built

`services/serviq-platform-management-backend` — Laravel 13 on
`php:8.4-apache`, PostgreSQL (`serviq_platform`), RabbitMQ. Scaffolded from the
IAM skeleton and adapted:

- **Tenant entity** (system of record, ADR-0002): `tenants`
  (`id` UUIDv7 = the JWT `tenant_id`, `name`, `slug` unique, `status`,
  `plan_id`), `plans`, `feature_flags`, `outbox`, `processed_events`.
- **Lifecycle state machine** `App\Domain\Tenancy\TenantLifecycle`:
  pending → active/deactivated; active → suspended/deactivated;
  suspended → active/deactivated; deactivated is terminal. Guarded update via
  `sourcesFor()` so concurrent transitions lose rather than corrupt.
- **API**: plans CRUD, tenants CRUD + `activate|suspend|deactivate`,
  feature-flag upsert. Every `/api/v1/*` route requires
  `jwt.auth` + `role:Platform Administrator` — platform-operated only.
  Illegal transitions → `409 illegal_transition`.
- **JWT verify-only** `App\Services\JwtVerifier`: IAM JWKS
  (`JWT_JWKS_URL=http://identity-access-backend/.well-known/jwks.json`, 5-min
  cache) → `JWT_PUBLIC_KEY` → `JWT_SECRET` HS256 fallback; iss/aud/jti/sub
  checked. Resolved mode logged, mirroring IAM. This service never signs.
- **Events**: `Platform.TenantCreated` (+ Activated/Suspended/Deactivated,
  PlanCreated) recorded in `outbox` in the same transaction;
  `platform-management-consumer` runs `outbox:publish` only — PM has no
  subscriptions yet.
- Seeders: plans `free`/`starter`/`pro`, flags `ai-agent`,
  `customer-portal`, `payouts`.

## Verified live

- `docker compose build platform-management-backend -consumer` + `up -d` —
  healthy on :8011, JWKS resolved to RS256.
- Platform admin token from IAM → `POST /plans`, `POST /tenants
  {"activate":true}` → tenant `active`.
- Outbox relayed → IAM consumer logged `Tenant scope registered: <uuid>`;
  `tenant_scopes` row exists in `serviq_identity`.
- Created tenant-scoped role + `acme-admin` user in IAM → login with
  `tenant_id` → claims carry `tenant_id`, `Tenant Administrator`, iam
  permissions. Tenant token on PM API → 403 (correct: platform-only).
- suspend → active round-trip OK; pending → suspend → 409.
- phpspec 6/6, behat 5/5 (TenantLifecycle + lifecycle feature file).

## Notes for the next service

- Compose builds a **separate image per service name** — always
  `docker compose build <api> <consumer>`, not just the backend.
- IAM tenant-scoped login takes `tenant_id` (not `scope`); role assignment
  takes role **names**, not ids.
- Consumer services that only publish need `SKIP_DB_SETUP=true` +
  `command: php artisan outbox:publish` — no `events:consume` until the
  service has a handler (the command requires a `RABBITMQ_QUEUE` binding list).
- If queues pre-exist with different args, delete them via the RabbitMQ mgmt
  API (`DELETE :15672/api/queues/%2F/<q>`) before redeploying.
- `git config core.hooksPath .githooks` still needs running locally once
  (blocked in-session).

## Next

Phase 1.3 per BUILD_SEQUENCE.MD: Service Management backend
(`serviq-service-management-backend`, port 8012).
