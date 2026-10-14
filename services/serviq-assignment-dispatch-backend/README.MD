# Assignment & Dispatch Backend (:8016)

Who should perform the Service Job — four strategies: dispatcher pick,
automatic (eligibility + scoring engine), broadcast (offers → first valid
accept), and self-assignment. Workforce and Job arrive as event
projections; dispatch never queries another service.

## What it's for

A confirmed job needs hands. This service owns matching work to people:

- **Dispatcher pick** — a human assigns directly, or asks
  `/dispatch/recommend` for scored candidates.
- **Automatic** — the configured rule scores eligible agents and assigns
  the winner; no eligible agents → `Assignment.Unassigned` and the job
  stays queued.
- **Broadcast** — the job is offered to eligible agents; first valid
  accept wins, losers' offers are revoked. Stale offers are swept to
  `expired` (tiered timeout).
- **Self-assignment** — an agent claims from the open queue.
- **Mid-flight reassignment** — `/dispatch/reassign` moves a job when the
  original agent can't finish (ADR-0024).

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/assignments[?status|job_id|agent_id]` | Assignment records |
| `GET …/dispatch/queue`, `GET …/dispatch/recommend` | Unassigned jobs + scored candidates |
| `GET …/offers?agent_id=`, `GET/PUT …/dispatch/rules` | Agent's offers + strategy config |
| `POST …/dispatch/assign|broadcast|reassign` | Dispatcher actions (`dispatch.assignments.manage`) |
| `POST …/dispatch/self-assign` | Agent claims (`jobs.execute`) |
| `POST …/assignments/{a}/accept|reject` | Agent answers an offer (`jobs.execute`) |
| `GET /api/health` | Liveness |
| Consumes | `Job.*`, `Workforce.*` → projections (`dispatchable_jobs`, `agents`) |
| Emits | `Assignment.Offered/Accepted/Rejected/Revoked/OfferExpired/Unassigned` via outbox |

All `/api/v1/*` routes: `jwt.auth` + `tenant.scope` + `permission:*`
gates. Job Management consumes `Assignment.Accepted` → `Job.Assigned`.

## Concurrency

Broadcast/self-assign races resolve with a guarded
`UPDATE … WHERE status='offered'` inside a transaction — exactly one
winner. The partial unique index `assignments_one_accepted` is the
backstop. The `-consumer` container runs `outbox:publish` +
`events:consume` + the `offers:expire` sweep.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-assignment-dispatch-backend` (phpspec + behat, sqlite — **never** `phpunit`/`artisan test` inside the running container) |
| Event loops | `serviq-assignment-dispatch-consumer` — `outbox:publish` + `events:consume` + `offers:expire` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d assignment-dispatch-backend assignment-dispatch-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | `App\Domain\Dispatch\AssignmentEngine` is pure domain logic — eligibility + scoring over projections (`skillMatch*100 − load*10`), no I/O, trivially unit-testable. Strategy choice lives in `assignment_rules` config, not scattered conditions. |
| **Event-driven** | `Job.ReadyForAssignment` triggers the configured strategy; `Job.*`/`Workforce.*` feed `dispatchable_jobs`/`agents` projections (`JobEventHandler`, `AgentProjectionHandler`) — event-carried state transfer, zero cross-service queries. |
| **SOLID** | SRP — `AssignmentEngine` (rank) vs handlers (projections) vs controller (HTTP) vs the guarded accept query (concurrency). OCP — strategies are selectable per tenant rule; adding one doesn't touch the engine. |
| **Hexagonal** | Broker access isolated in `App\Services\Messaging\RabbitMq`; the outbox (`DomainEventRecorder`) is the only publish path. |
