# Identity & Access Backend

IAM command API — the sole JWT issuer for ServIQ (ADR-0001). Owns users,
roles, permissions, and tenant scopes; signs RS256 access tokens every other
service verifies with the public key only.

- Stack: Laravel (php:apache, mod_php) + PostgreSQL + Redis (JWT blacklist) + RabbitMQ (domain events)
- Specs: `workspace/specs/technical/security/` (IDENTITY_AND_ACCESS, JWT_SIGNING_KEYS, JWT_INVALIDATION)
- Map entry: `SERVICE_MAP.md` → Identity & Access Backend

## API surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/login` | public | Issue a JWT for `(scope, username)` — scope is `platform` or a `tenant_id` |
| `POST /api/v1/auth/logout` | JWT | Revoke the token (`jwt:blacklist:<jti>` in Redis) |
| `GET /api/v1/auth/me` | JWT | Echo the caller's claims |
| `GET /.well-known/jwks.json` | public | Public key material (RS256 only) |
| `GET/POST /api/v1/tenants` | `iam.tenants.*` | Tenant scope registration (provisioning) |
| `GET/POST /api/v1/roles`, `POST /api/v1/roles/{id}/permissions` | `iam.roles.*` | Per-scope roles and grants |
| `GET/POST /api/v1/users`, `PATCH /api/v1/users/{id}`, `POST /api/v1/users/{id}/roles` | `iam.users.*` | Per-scope users and role assignment |
| `GET /api/v1/permissions` | `iam.roles.read` | IAM permission catalog |
| `GET /api/health` | public | Liveness |

## Signing modes

`JwtIssuer` resolves at startup, logged loudly:

- `JWT_PRIVATE_KEY` set → RS256. If unset, `docker/entrypoint.sh` generates a
  local keypair into `storage/keys/` so RS256 works out of the box.
- Otherwise `JWT_SECRET` → HS256 — local/test fallback only (JWT_SIGNING_KEYS.MD).

Claims: `sub` (user UUIDv7), `tenant_id`, `roles`, `permissions`, `iss`, `aud`, `exp`, `iat`, `jti`.

## Events

- `outbox` rows are written with each state change; `php artisan outbox:publish`
  relays them to the `serviq.events` topic exchange.
- `php artisan events:consume` consumes `Platform.*` into
  `identity-access.events` (dead-lettered to `identity-access.events.dlq`),
  deduped via `processed_events`. `Platform.TenantCreated` registers the tenant scope.
- The `identity-access-consumer` compose service runs both loops in one
  dedicated container — never inside the API process.

## Local

```sh
./scripts/install.sh                       # env + staged stack
docker compose -f services/docker-compose.yml up -d identity-access-backend --wait
curl -X POST http://localhost:8010/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"serviq-local"}'   # seeded Platform Administrator
```

Tests: `vendor/bin/phpspec run` (TDD) and `vendor/bin/behat` (BDD) — no database required.
