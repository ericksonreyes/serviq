# Platform Management Backend

Platform Management command API — owns the Tenant entity (ADR-0002),
subscription plans, and platform feature flags. IAM receives tenant scope via
`Platform.TenantCreated` and binds identities to `tenant_id`.

- Stack: Laravel (php:apache, mod_php) + PostgreSQL + RabbitMQ (domain events)
- Specs: `workspace/specs/domain/specs/domain_boundaries/platform/` + ADR-0002
- Map entry: `SERVICE_MAP.md` → Platform Management Backend

## API surface

All `/api/v1/*` routes require a platform-scoped JWT issued by IAM
(`role:Platform Administrator`). Verification is RS256 via IAM's
`/.well-known/jwks.json` (`JWT_JWKS_URL`), with `JWT_PUBLIC_KEY`/`JWT_SECRET`
fallbacks — this service never issues tokens.

| Route | Purpose |
| --- | --- |
| `GET/POST /api/v1/plans`, `GET/PATCH /api/v1/plans/{id}` | Subscription plan catalog |
| `GET/POST /api/v1/tenants`, `GET/PATCH /api/v1/tenants/{id}` | Tenant provisioning (`POST` emits `Platform.TenantCreated`) |
| `POST /api/v1/tenants/{id}/activate` | pending/suspended → active |
| `POST /api/v1/tenants/{id}/suspend` | active → suspended |
| `POST /api/v1/tenants/{id}/deactivate` | → deactivated (terminal) |
| `GET /api/v1/feature-flags`, `PUT /api/v1/feature-flags` | Platform-wide feature flags |
| `GET /api/health` | Liveness |

Illegal lifecycle transitions return `409 illegal_transition`
(`App\Domain\Tenancy\TenantLifecycle` is the state machine).

## Events

- `outbox` rows are written in the same transaction as each state change;
  `php artisan outbox:publish` relays them to the `serviq.events` topic
  exchange (routing key = event type, e.g. `Platform.TenantCreated`).
- Published: `Platform.TenantCreated`, `Platform.TenantActivated`,
  `Platform.TenantSuspended`, `Platform.TenantDeactivated`, `Platform.PlanCreated`.
- The `platform-management-consumer` compose service runs the outbox relay in
  a dedicated container. This service has no subscriptions yet —
  `events:consume` lands with its first handler.

## Local

```sh
./scripts/install.sh
docker compose -f services/docker-compose.yml up -d serviq-workforce-management-backend --wait
# needs a platform-scoped token from IAM (:8010):
TOKEN=$(curl -s -X POST http://localhost:8010/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"serviq-local"}' | jq -r .access_token)
curl -X POST http://localhost:8011/api/v1/tenants \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Acme","slug":"acme","activate":true}'
```

Seeded plans: `free`, `starter`, `pro`. Tests: `vendor/bin/phpspec run` and
`vendor/bin/behat` — no database required.
