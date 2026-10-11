# Handoff — 2026-10-10 — dev-mode stack + frontend/signup/seed work

## Done This Session

Two commits on `main`:

- `9b91274` **feat: real frontends, self-serve signups, and install-time demo seeding**
  - Four React+Vite apps replaced the static nginx shells: Customer Portal + Service Agent (MUI, agent has `vite-plugin-pwa`), Tenant Console + Platform Admin (Tailwind); `react-router-dom`, plain `fetch` per app, in-memory token.
  - Self-serve flows per personas: IAM `POST /api/v1/auth/register` (Customer/Service Agent roles only — privileged roles 422); platform-management `POST /api/v1/tenants/signup` (PENDING tenant). `Platform.TenantCreated` generalized to `initial_users`; IAM `TenantCreatedHandler` provisions each with its role.
  - Install-time demo seeding via `db:seed`: `DemoTenantSeeder` creates Acme on the FIXED tenant id `01ac0000-0000-7000-8000-00000000acde` (so other contexts' `DemoCatalogSeeder`/`DemoAgentSeeder`/`DemoCustomerSeeder` can write tenant-scoped rows without lookups). Accounts table in `README.MD#local-seed-accounts`.
  - `install.sh` gained post-bring-up smoke checks (4 frontends, 12 Laravel `/api/health`, 2 BFFs, ai `/docs`, unhealthy-container scan) and exits non-zero on failure.
  - Infra ports bound to loopback; rabbitmq `hostname:` pinned (random hostnames were orphaning mnesia state); MinIO 256m, consumers 128m caps.

- `85fa32b` **chore: dev-mode compose stack — bind mounts, hot reload, named containers**
  - `docker-compose.yml` is now the dev stack: every service dir bind-mounted (deps included → host fs, IDE-indexable). Laravel serves per-request, BFFs `node --watch`, ai-agent `uvicorn --reload`; frontends are `vite dev` containers on 8080–8083 (nginx Dockerfiles kept as deployment artifacts only). `develop.watch` and `docker-compose.dev.yml` are gone.
  - `install.sh` `[deps]` stage installs each backend `vendor/` via one-off `composer:2` (runtime images have no composer); Node services self-install on boot; `serviq-composer-cache`/`npm-cache` named volumes share download caches only.
  - `container_name` on all services: `infra-*` for infra, `serviq-*` for apps.
  - Bug fix surfaced by mounts: service-job domain `jobs` table vs framework queue `jobs` — renamed to `queue_jobs` (config + migration).
  - "NestJS" → Express corrected across docs (BFFs were always plain Express; label was aspirational). `LOCAL_DEVELOPMENT.MD` added.

## Current State

- Working tree clean; all four frontends verified 200 on 8080–8083; both BFFs 200 on 3000/3001.
- **Docker Desktop crashed and restarted mid-session**, wiping container+image state; volumes/data survived. Frontends + BFFs were re-spun and verified — the rest of the stack was mid-re-pull/rebuild when the session paused (ollama ~2.7GB pull was in flight).
- All 12 backend `vendor/` dirs exist on host; `migrate:status` clean on all 12 DBs.
- PHPUnit dev deps aren't in the runtime images — `RegisterTest.php` runs in CI/dev envs only.

## Decisions Made

- Deps on host fs via full-dir bind mounts, installed inside containers — kills rebuild churn (Docker.raw only grows) and gives IDE indexing; rule: never run host-native npm/composer in service dirs (linux binaries).
- Shared package-manager *cache* volumes, never shared installed trees — keeps per-service lockfile independence.
- Frontend local shape is `vite dev` only; static nginx builds demoted to deployment artifacts.
- Express over NestJS for BFFs — they're deliberately thin; NestJS is a "revisit if a BFF grows real logic" note, not a commitment.
- Fixed demo tenant UUID so cross-context demo seeders can coordinate without cross-DB reads.

## Next Steps

1. Finish stack recovery post-Docker-restart: `docker compose -f services/docker-compose.yml --profile infra --profile domain --profile ai --profile full up -d` — rebuilds/pulls anything missing (ollama image notably), then re-run install's smoke checks or `./scripts/install.sh`.
2. Verify the demo flow end-to-end against the mounted stack (login each role; create a service request as `jane.customer` against Acme's seeded catalog).
3. Optional: workforce consumer for `Identity.UserRegistered` (role=Service Agent) → auto-create/link `agents.user_id` — currently unlinked (`anna.agent` mirrors by name only).
4. Optional: add `migrate:status` probe to smoke checks — `/api/health` is DB-free and missed the `jobs` collision for days.

## Key Files

- `services/docker-compose.yml`, `scripts/install.sh` — dev-mode stack + staged installer
- `workspace/specs/technical/infrastructure/LOCAL_DEVELOPMENT.MD` — dev workflow doc
- `README.MD#local-seed-accounts` — demo credentials + fixed tenant id
- `services/serviq-identity-access-backend/app/Http/Controllers/AuthController.php` — register endpoint
- `services/serviq-platform-management-backend/database/seeders/DemoTenantSeeder.php` — demo seed source of truth
- `services/serviq-identity-access-backend/app/Events/Handlers/TenantCreatedHandler.php` — `initial_users` provisioning
