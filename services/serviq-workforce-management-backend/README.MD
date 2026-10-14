# Workforce Management Backend (:8015)

Command API for the field workforce — agent profiles, skills, service
areas, and availability. Dispatch matches against `Workforce.*`
projections; it never queries this service synchronously.

## What it's for

Before a job can be assigned, someone has to know who exists and what
they can do:

- **Agent registry** — the tenant's field agents with skills, service
  areas, and active/suspended status.
- **Availability** — when agents are actually bookable
  (`AgentAvailability`).
- **Eligibility lookups** — `/agents/eligible` filters by skills/area for
  dispatch and repair-guide recommendations.
- **Plan gating** — tenant plan features are projected locally, so
  headcount limits are enforced here without calling Platform
  Management.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/agents`, `GET …/{agent}` | Agent roster |
| `GET …/agents/eligible?skills[]&area` | Skill/area-filtered candidates |
| `POST /api/v1/agents`, `PATCH …/{agent}` | Register / update (`workforce.agents.manage`) |
| `GET /api/health` | Liveness |
| Consumes | `Platform.*` → `projected_plan_features` (`PlanFeaturesHandler`) |
| Emits | `Workforce.AgentRegistered`, `Workforce.AgentUpdated` via outbox |

All `/api/v1/*` routes: `jwt.auth` + `tenant.scope`; mutations gated on
`workforce.agents.manage`.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-workforce-management-backend` (phpspec + behat, sqlite — **never** `phpunit`/`artisan test` inside the running container) |
| Event loops | `serviq-workforce-consumer` container runs `outbox:publish` + `events:consume` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d workforce-backend workforce-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | Workforce facts — skills, areas, availability, status — are owned here. Other contexts (dispatch, execution) read projections of `Workforce.*` events; they never reach into this schema. |
| **Event-driven** | `Platform.*` events feed `ProjectedPlanFeatures` — plan limits enforced locally via event-carried state transfer, not synchronous calls upstream. |
| **SOLID** | SRP — `AgentController` (roster) vs `PlanFeaturesHandler` (inbound projection) vs `DomainEventRecorder` (outbox). |
| **Hexagonal** | Messaging behind `App\Services\Messaging\RabbitMq` + the shared outbox — controllers record events, never touch the broker. |
