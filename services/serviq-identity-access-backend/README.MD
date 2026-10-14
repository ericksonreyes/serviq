# Identity & Access Backend (:8010)

IAM command API — the sole JWT issuer for ServIQ (ADR-0001). Owns users,
roles, permissions, and tenant scopes; signs RS256 access tokens every
other service verifies with the public key only.

## What it's for

Every API call in the platform starts with "who is this and what may they
do":

- **Token issuance** — `/auth/login` signs a scoped JWT (`platform` or a
  `tenant_id`); `/auth/logout` blacklists its `jti` in Redis.
- **Key distribution** — `/.well-known/jwks.json` is the only key
  material other services need; verification is verify-only everywhere
  else.
- **Identity administration** — per-scope users, roles, and permission
  grants; tenant scopes register themselves off `Platform.TenantCreated`.

## Surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/login` | public | Issue a JWT for `(scope, username)` |
| `POST /api/v1/auth/logout` | JWT | Revoke (`jwt:blacklist:<jti>` in Redis) |
| `GET /api/v1/auth/me` | JWT | Echo the caller's claims |
| `GET /.well-known/jwks.json` | public | RS256 public key material |
| `GET/POST /api/v1/tenants` | `iam.tenants.*` | Tenant scope registration |
| `GET/POST /api/v1/roles`, `POST …/roles/{id}/permissions` | `iam.roles.*` | Roles and grants |
| `GET/POST /api/v1/users`, `PATCH …/{id}`, `POST …/{id}/roles` | `iam.users.*` | Users and role assignment |
| `GET /api/v1/permissions` | `iam.roles.read` | Permission catalog |
| `GET /api/health` | public | Liveness |
| Consumes | `Platform.*` → `identity-access.events` (DLQ: `.dlq`, deduped via `processed_events`) — `TenantCreated` registers the scope |

Claims: `sub` (user UUIDv7), `tenant_id`, `roles`, `permissions`, `iss`,
`aud`, `exp`, `iat`, `jti`.

## Signing modes

`JwtIssuer` resolves at startup, logged loudly:

- `JWT_PRIVATE_KEY` set → **RS256**. If unset, `docker/entrypoint.sh`
  generates a local keypair into `storage/keys/` so RS256 works out of
  the box.
- Otherwise `JWT_SECRET` → **HS256** — local/test fallback only
  (JWT_SIGNING_KEYS.MD).

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-identity-access-backend` (phpspec + behat — **never** `phpunit`/`artisan test` inside the running container) |
| Event loops | `serviq-identity-access-consumer` runs `outbox:publish` + `events:consume` in one dedicated container — never in the API process |
| Seeded login | `POST :8010/api/v1/auth/login {"username":"admin","password":"serviq-local"}` → Platform Administrator token |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | One context owns identity end-to-end: no other service issues tokens, stores users, or resolves permissions — they verify claims only. Tenant lifecycle is consumed, not invented (`Platform.*` events register scopes). |
| **Hexagonal** | Key resolution is a strategy chain (`JwtIssuer`: PEM → JWKS → secret); the blacklist is a Redis port with a documented exp-only degradation mode (JWT_INVALIDATION.MD). Outbox + `RabbitMq` isolate the broker. |
| **SOLID** | SRP — `JwtIssuer` (signing) vs `TokenBlacklist` (revocation) vs `JwtVerifier`-style verify path. OCP — new signing modes slot into the resolution chain. |
| **Event-driven** | `outbox` written with each state change; `Platform.TenantCreated` → tenant scope — provisioning propagates without a synchronous IAM call. |
| **Security** | RS256 asymmetric signing means private key material exists in exactly one service; HS256 fallback is loudly logged and local/test only. |
