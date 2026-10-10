# Service Job Management Backend

The core transactional domain — owns the **job lifecycle** and each job's
**workflow instance** (a snapshot of the service's template). First
event-sourced service: `job_events` is the source of truth; `jobs` is a
rebuildable projection.

- Stack: Laravel (php:apache) + PostgreSQL (`serviq_jobs`) + RabbitMQ
- Port: 8014

## Event sourcing

- `JobStore::record()` appends to `job_events`, folds into the projection,
  and writes the outbox row in one transaction.
- `POST …/jobs/{id}/replay` rebuilds `jobs` from the stream.
- `GET …/jobs/{id}/history` returns the raw stream.

## Two layers of events

- **Fixed lifecycle** (other contexts rely on these): `Job.Requested`,
  `Job.Confirmed`, `Job.ReadyForAssignment`, `Job.Assigned`, `Job.Accepted`,
  `Job.Started`, `Job.Completed`, `Job.Cancelled`.
- **Generic step events** (step names are payload, never event types):
  `Job.WorkflowStepStarted`/`Job.WorkflowStepCompleted` `{job_id, step_name,
  step_position}`; `Job.WorkflowReordered` for open-step reordering.

## Consumed events

- `Request.Submitted` → create job `requested` with the template snapshot.
- `ServiceManagement.ServiceCreated`/`WorkflowTemplateChanged` →
  `service_templates` projection (event-carried state transfer).
- The `-consumer` container runs `outbox:publish` + `events:consume`
  (bindings `Request.*`, `ServiceManagement.*`).

## API surface (JWT + `tenant.scope`)

`GET …/jobs[?status]`, `GET …/jobs/{id}` + `/history`, `/replay`;
transitions `confirm → ready → assign{agent_id} → accept → start`;
steps `…/steps/{pos}/start|close`, `PUT …/jobs/{id}/steps` reorder;
`cancel` from any non-terminal state. Closing the final step auto-completes.

Tests: `vendor/bin/phpspec run`, `vendor/bin/behat`.
