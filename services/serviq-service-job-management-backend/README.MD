# Service Job Management Backend (:8014)

The core transactional domain — owns the **job lifecycle** and each job's
**workflow instance** (a snapshot of the service's step template). First
event-sourced service: `job_events` is the source of truth; `jobs` is a
rebuildable projection.

## What it's for

A customer request becomes real work here. This service answers "what is
the job, what state is it in, and what must happen next":

- **Job lifecycle** — `requested → confirmed → ready → assigned →
  accepted → started → completed` (or `cancelled`); every transition is
  an event other contexts rely on.
- **Workflow instances** — the catalog template is snapshotted per job,
  so template edits never retroactively change live work.
- **Step tracking** — field execution reports step start/close back over
  events; the authoritative instance mutates here; closing the final
  step auto-completes the job.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/jobs[?status]`, `GET …/{job}` | Job read |
| `GET …/jobs/{job}/history` | Raw event stream for the job |
| `POST …/jobs/{job}/replay` | Rebuild the `jobs` projection from the stream |
| `POST …/jobs/{job}/confirm|ready|assign|cancel|reschedule` | Dispatcher transitions (`dispatch.assignments.manage`) |
| `POST …/jobs/{job}/accept|start` | Agent transitions (`jobs.execute`) |
| `PUT …/jobs/{job}/steps`, `POST …/steps/{pos}/start|close` | Open-step reorder + step transitions |
| `GET /api/health` | Liveness |
| Consumes | `Request.*`, `ServiceManagement.*`, `Assignment.*`, `Execution.*` → `service-jobs.events` (DLQ: `.dlq`) |
| Emits | `Job.*` via transactional outbox → `serviq.events` |

All `/api/v1/*` routes: `jwt.auth` + `tenant.scope` + per-route
`permission:*` gates.

## Two layers of events

- **Fixed lifecycle** — `Job.Requested/Confirmed/ReadyForAssignment/
  Assigned/Accepted/Started/Completed/Cancelled` — the contract other
  contexts consume.
- **Generic step events** — `Job.WorkflowStepStarted/Completed`
  `{job_id, step_name, step_position}` and `Job.WorkflowReordered`. Step
  names are payload, never event types, so templates evolve without
  schema changes.

Inbound wiring: `Request.Submitted` → job created with template snapshot
(`RequestSubmittedHandler`); `ServiceManagement.ServiceCreated/
WorkflowTemplateChanged` → `service_templates` projection, i.e.
event-carried state transfer (`ServiceTemplateHandler`); `Assignment.*`
and `Execution.*` → lifecycle mutations.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-service-job-management-backend` (phpspec + behat, sqlite — **never** `phpunit`/`artisan test` inside the running container) |
| Event loops | `serviq-service-job-consumer` container runs `outbox:publish` + `events:consume` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d service-job-backend service-job-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **Event sourcing** | `App\Services\JobStore::record()` appends `job_events`, folds the `jobs` projection, and writes the outbox row in one transaction. `/replay` + `/history` expose the stream — the projection is disposable. |
| **DDD** | The lifecycle is a domain state machine (`App\Domain\Jobs\JobLifecycle`) — illegal transitions are rejected by the aggregate, not by controller checks. Step/template semantics stay here; dispatch and execution only signal. |
| **Event-driven** | Four inbound event families drive projections and lifecycle (`app/Events/Handlers/*`); `service_templates` shows event-carried state transfer — no synchronous reads into Service Management. |
| **Hexagonal** | Messaging behind `App\Services\Messaging\RabbitMq`; `DomainEventRecorder` is the outbox port every write path shares. |
| **SOLID** | SRP — `JobStore` (persistence) vs `JobLifecycle` (rules) vs per-family `*Handler`s (inbound events). OCP — new event sources register as handlers/bindings, not core rewrites. |
