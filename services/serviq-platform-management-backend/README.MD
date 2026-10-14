# Platform Management Backend (:8011)

Platform operator command API — owns the Tenant entity (ADR-0002),
subscription plans, and platform feature flags. Tenant scopes propagate
to IAM via `Platform.TenantCreated`; identities bind to `tenant_id`.

## What it's for

ServIQ is multi-tenant SaaS — someone has to own the tenant lifecycle
itself:

- **Tenant provisioning** — create, activate, suspend, deactivate; the
  state machine is the single authority on legal transitions.
- **Plan catalog** — subscription tiers (`free`, `starter`, `pro`
  seeded) that downstream services gate against via projected features.
- **Feature flags** — platform-wide switches read through the API.

## Surface

| Route | Purpose |
| --- | --- |
| `GET/POST /api/v1/plans`, `GET/PATCH …/plans/{id}` | Subscription plan catalog |
| `GET/POST …/tenants`, `GET/PATCH …/tenants/{id}` | Provisioning (`POST` → `Platform.TenantCreated`) |
| `POST …/tenants/{id}/activate`, `/suspend`, `/deactivate` | Lifecycle transitions |
| `GET/PUT /api/v1/feature-flags` | Platform-wide flags |
| `GET /api/health` | Liveness |
| Emits | `Platform.TenantCreated/Activated/Suspended/Deactivated`, `Platform.PlanCreated` via outbox |

All `/api/v1/*` routes require a **platform-scoped** JWT
(`role:Platform Administrator`) — verified via IAM JWKS/public key/secret
resolution; this service never issues tokens. Illegal transitions return
`409 illegal_transition` (`App\Domain\Tenancy\TenantLifecycle`).

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-platform-management-backend` (phpspec + behat — **never** `phpunit`/`artisan test` inside the running container) |
| Outbox relay | `serviq-platform-management-consumer` runs `outbox:publish`; `events:consume` lands with its first subscription |
| Smoke test | `POST :8011/api/v1/tenants {"name":"Acme","slug":"acme","activate":true}` with a platform token from IAM `:8010` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | `App\Domain\Tenancy\TenantLifecycle` is a domain state machine — the legal-transition table lives in the domain, controllers return its `409`s. Tenant ownership is exclusive (ADR-0002). |
| **Event-driven** | `outbox` rows written in the same transaction as each state change → `serviq.events` (routing key = event type). IAM, Workforce, and Service Management all provision/gate off `Platform.*` — no synchronous fan-out. |
| **SOLID** | SRP — `TenantLifecycle` (rules) vs controllers (HTTP) vs `DomainEventRecorder` (outbox). |
| **Hexagonal** | Broker isolated in `App\Services\Messaging\RabbitMq`; JWT verification resolves PEM → JWKS → secret like every sibling service. |
