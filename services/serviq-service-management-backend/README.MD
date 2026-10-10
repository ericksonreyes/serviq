# Service Management Backend

Tenant service catalog + workflow step templates — defines **what can be
requested**. Job Management instantiates the template into a job's workflow
instance (spec: `domain_boundaries/service_operations/SERVICE_MANAGEMENT.MD`).

- Stack: Laravel (php:apache) + PostgreSQL (`serviq_services`) + RabbitMQ
- Port: 8012

## API surface

All `/api/v1/*` routes require a JWT and tenant scope
(`tenant.scope` middleware: platform tokens pass anywhere; tenant tokens are
pinned to their own `tenant_id`).

| Route | Purpose |
| --- | --- |
| `GET /api/v1/tenants/{tid}/services` | List catalog (with steps) |
| `POST /api/v1/services` | Create service + optional `steps[]` → `ServiceManagement.ServiceCreated` |
| `GET/PATCH /api/v1/tenants/{tid}/services/{id}` | Show / update |
| `PUT /api/v1/tenants/{tid}/services/{id}/steps` | Replace workflow template → `ServiceManagement.WorkflowTemplateChanged` |
| `GET /api/health` | Liveness |

`steps[]`: `[{name, required_evidence: [photo|signature|notes]}]` ordered by
array position. Template edits affect new jobs only.

## Events

`ServiceManagement.ServiceCreated`, `ServiceManagement.ServiceUpdated`,
`ServiceManagement.WorkflowTemplateChanged` — via outbox → `serviq.events`.
The `-consumer` container runs `outbox:publish` only.

Tests: `vendor/bin/phpspec run`, `vendor/bin/behat`.
