# Service Management Backend (:8012)

Command API for the tenant service catalog and its supporting reference
data — workflow step templates, locations, service areas, coverage,
pricing, repair guides, and tenant settings. It defines **what can be
requested**; Job Management instantiates templates into live jobs.

## What it's for

Tenants sell services; the platform sells coverage. This service owns the
tenant-facing catalog and the geography it operates in:

- **Service catalog** — what a tenant offers, each with an ordered
  workflow template (`steps[]` with `required_evidence`) that jobs
  snapshot at creation.
- **Locations & service areas** — a hierarchical location tree plus the
  areas the tenant actually covers, so requests can be coverage-checked.
- **Pricing & availability** — per-service pricing and the server-side
  bookable-capacity gate (ADR-0025).
- **Repair guides** — curated troubleshooting content the AI agent's
  `repair_guide_search` tool reads.
- **Coverage demand** — customers outside covered areas register
  interest; `CoverageExpansionHandler` turns it into expansion signal.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET /api/v1/locations/roots|search|{code}|{code}/children` | Location hierarchy (no tenant scope) |
| `GET/POST …/services`, `GET/PATCH …/{service}` | Catalog CRUD |
| `PUT …/services/{s}/steps` | Replace workflow template → `WorkflowTemplateChanged` |
| `GET …/operations`, `GET …/{s}/availability`, `GET/PUT …/{s}/pricing` | Ops summary, capacity gate, pricing |
| `GET/POST …/repair-guides` | Curated repair content (AI + dispatcher reads) |
| `GET/POST/PATCH/DELETE …/service-areas` | Coverage areas |
| `GET …/coverage/check`, `POST/GET …/coverage/interest` | Coverage check + demand signal |
| `GET/PUT …/settings` | Tenant settings |
| `GET /api/health` | Liveness |
| Consumes | `Workforce.Agent*`, `Platform.*` (+ handlers: availability, plan features, coverage expansion) |
| Emits | `ServiceManagement.*` via outbox → `serviq.events` |

All `/api/v1/*` routes: `jwt.auth` (+ `tenant.scope` on tenant routes);
mutations gated on `catalog.services.manage`.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-service-management-backend` (phpspec + behat — **never** `phpunit`/`artisan test` inside the running container) |
| Event loops | `serviq-service-management-consumer` runs `outbox:publish` + `events:consume` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d service-management-backend service-management-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | The catalog is reference data other contexts consume as projections — Job Management's `service_templates` table is event-carried state transfer off `ServiceManagement.*`, so availability/templates stay owned here while jobs run autonomous. |
| **Event-driven** | Inbound `Workforce.Agent*`/`Platform.*` feed availability and plan-feature projections (`AgentAvailabilityHandler`, `PlanFeaturesHandler`); coverage interest events drive `CoverageExpansionHandler` — demand data arrives without polling. |
| **Hexagonal** | Broker isolated in `App\Services\Messaging\RabbitMq` + shared outbox. Location data is seeded reference content behind normal routes — the catalog can be re-seeded without schema change. |
| **SOLID** | SRP — catalog vs locations vs coverage vs settings as separate controllers/handlers. Template changes emit `WorkflowTemplateChanged` rather than mutating jobs (immutability of live work, enforced downstream). |
