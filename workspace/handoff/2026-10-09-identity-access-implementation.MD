# Handoff — 2026-10-09 — Identity & Access implementation

## Done This Session

- First real service implementation: `services/serviq-identity-access-backend` — Laravel 13 on `php:8.4-apache`
  (mod_php, ADR-0009), PostgreSQL + Redis + RabbitMQ.
- IAM domain: tenant scopes, users, roles, permissions with `(scope, username)` uniqueness (`platform` scope or
  tenant UUIDv7); UUIDv7 ids via `HasUuid7` trait.
- JWT: RS256 issuance per ADR-0001 claim shape (`sub`, `tenant_id`, `roles`, `permissions`, `iss`, `aud`, `exp`,
  `iat`, `jti`); `JwtIssuer` logs the resolved signing mode; entrypoint generates a container-local keypair in
  `storage/keys/` when `JWT_PRIVATE_KEY` is unset; HS256 `JWT_SECRET` fallback kept for local/test only.
- Revocation: Redis `jwt:blacklist:<jti>` on logout, exp-only fallback when Redis unreachable (logged).
- Endpoints: login/logout/me, `/.well-known/jwks.json`, tenants, roles, permissions, users — all JWT-protected
  except login/health/jwks; login rate-limited 5/min.
- Events: `outbox` table + `php artisan outbox:publish` relay → `serviq.events`; `php artisan events:consume`
  subscribes `Platform.*` with DLQ + `processed_events` dedupe; `Platform.TenantCreated` registers tenant scopes.
- Seeded Platform Administrator (`admin` / `IAM_SEED_ADMIN_PASSWORD`, local default `serviq-local`).
- Tests: PHPSpec `ClaimsBuilderSpec` (3 passing), Behat `jwt_claims.feature` (2 scenarios passing).
- Docker: multi-stage `composer:2` → `php:8.4-apache` Dockerfile, `.dockerignore`, `docker/entrypoint.sh`;
  `identity-access-backend` + `identity-access-consumer` uncommented in `services/docker-compose.yml`.
- Verified live: RS256 login → claims → tenant-scoped login → cross-scope 403 → logout revocation → outbox
  relay → `Platform.TenantCreated` consumed into a registered tenant scope.

## Current State

- All changes uncommitted (repo convention — nothing is committed until asked). Service runs in the local stack
  on `:8010`.
- `.env` exists locally (gitignored) copied from `.env.example`.

## Decisions Made

- Consumer command is custom (`events:consume`/`outbox:publish`, php-amqplib) rather than
  `queue:work rabbitmq` — gives direct control of topic-exchange + DLX topology per EVENT_DELIVERY.MD; recorded
  in `SERVICE_STACKS.MD` notes.
- Permissions are a global catalog; roles are per-scope and carry the grants into JWT claims.
- Generated keypair lives in container storage — recreating the API container rotates keys and invalidates
  outstanding tokens (acceptable for local POC; mount a volume or set `JWT_PRIVATE_KEY` to pin).

## Next Steps

1. Platform Management backend (Phase 1.2): tenant lifecycle, emits `Platform.TenantCreated` — the IAM consumer
   binding is already live.
2. Distribute `JWT_PUBLIC_KEY` to other services as they land (`x-common-env` in compose already carries it).
3. Consider a shared Laravel service skeleton/starter extracted from this implementation for the other 11
   backends (middleware, outbox, consumer, Dockerfile are directly reusable).
4. `git config core.hooksPath .githooks` could not be set from the session (tool restriction) — set it manually.

## Key Files

- `services/serviq-identity-access-backend/` — service code, Dockerfile, README.MD
- `workspace/specs/technical/security/` — governing specs (IDENTITY_AND_ACCESS, JWT_SIGNING_KEYS, JWT_INVALIDATION)
- `workspace/specs/technical/infrastructure/EVENT_DELIVERY.MD` — event topology
- `workspace/specs/BUILD_SEQUENCE.MD` — Phase 1 ordering
