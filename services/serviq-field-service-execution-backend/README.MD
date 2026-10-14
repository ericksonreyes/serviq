# Field Service Execution Backend (:8017)

The agent's work loop — executions, check-ins, step evidence, and
completion. It reports what the agent did; Job Management owns what the
job *means* (step events mutate the authoritative workflow instance).

## What it's for

Once an agent accepts, the work happens on a phone in the field:

- **Executions** — `Assignment.Accepted` opens an execution record; the
  agent's session runs against it.
- **Check-ins** — arrival/on-site markers for the job timeline.
- **Evidence** — photos, signatures, notes per workflow step; files land
  in object storage (`serviq-evidence`), the structured record in
  `evidence` — `Execution.EvidenceCaptured` is what the AI agent parses.
- **Step progression** — start/close per step emits
  `Execution.StepStarted/StepCompleted`, and `/complete` closes out.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/executions`, `GET …/{execution}` | Execution read |
| `POST …/executions/{e}/check-in` | On-site marker |
| `GET/POST …/executions/{e}/evidence` | Step evidence upload + list |
| `POST …/executions/{e}/steps/{pos}/start|close` | Step progression |
| `POST …/executions/{e}/complete` | Finish the execution |
| `GET /api/health` | Liveness |
| Consumes | `Assignment.*`, `Job.*` → local projections (`JobEventHandler`) |
| Emits | `Execution.*` via transactional outbox → `serviq.events` |

All `/api/v1/*` routes: `jwt.auth` + `tenant.scope`; field actions gated
on `jobs.execute`.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-field-service-execution-backend` (phpspec + behat, sqlite — **never** `phpunit`/`artisan test` inside the running container) |
| Event loops | `serviq-field-service-consumer` container runs `outbox:publish` + `events:consume` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d field-service-backend field-service-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | Execution ≠ job: this context records *what the agent did* (check-ins, evidence, step signals); Job Management decides what that means for the lifecycle. Splitting them keeps field detail out of the core aggregate. |
| **Hexagonal** | Evidence storage is a real port — `Storage::disk('s3')` against MinIO (`AWS_ENDPOINT`, path-style); a cloud bucket swap is config, not code. Messaging isolated in `App\Services\Messaging\RabbitMq` + shared outbox. |
| **Event-driven** | `Assignment.*`/`Job.*` events build the local execution context; `Execution.*` events feed Job Management's workflow instance and the AI agent's parse pipeline — `EvidenceCaptured` is the seam between field work and AI. |
| **SOLID** | SRP — `ExecutionController` (HTTP) vs `JobEventHandler` (inbound projection) vs the evidence storage adapter. |
