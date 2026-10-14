# ADR-0024: Dispatcher reassignment on in-flight jobs

- Status: Accepted
- Date: 2026-10-14

## Context

Dispatcher's reassign endpoint originally closed the moment an agent accepted:
`POST /dispatch/reassign` only ran while the `DispatchableJob` projection sat at
`assigned`, and job-management dropped a late `Assignment.Accepted` for jobs
already `accepted`/`in_progress` so a stale event could not rewind the
lifecycle. The console hid the assignment section entirely once work began.
Real dispatch doesn't work that way — agents no-show after accepting, go sick
mid-route, or get pulled to an emergency — and the only escape hatch was
cancel + rebook, which loses the job's history and strands the customer.

## Decision

Reassignment is allowed on any **open** job — `assigned`, `agent_accepted`, or
`in_progress` in the dispatch projection; `closed` jobs still 409 with
`reassign_window_closed`. Two mechanical changes make this safe:

- `DispatchService::reassign` already revokes the accepted assignment and
  creates the new one atomically — unchanged — but `createAccepted` no longer
  writes `status = 'assigned'` when the projection is already further along
  (`agent_accepted`, `in_progress`), so a mid-flight swap does not rewind the
  dispatcher's view of the job.
- Job-management's `AssignmentAcceptedHandler` now distinguishes a *different*
  agent on an open job and records a new **`Job.Reassigned`** event
  (`agent_id`, `previous_agent_id`). `JobStore::apply` folds it into
  `assigned_agent_id` **without** a status change — `Job.Assigned` carries a
  status mapping and would have dragged an in-progress job back to
  `assigned`. Terminal jobs and same-agent duplicates still drop the event.

The revoked agent is told via the existing `Assignment.Revoked` notification
template; the incoming agent via a new `Job.Reassigned` template. Console job
pages expose "Reassign service agent" on all non-terminal jobs.

## Alternatives considered

- Keep the window closed (reassign = cancel + rebook) — rejected: destroys
  job history and forces the customer back through the pipeline for a pure
  staffing change.
- Rewind the lifecycle to `assigned` and let the new agent re-accept —
  rejected: falsifies the event stream (a job that started was never
  un-started) and would need to roll back executions and step state.
- Only allow reassignment up to `agent_accepted` — rejected: the highest-value
  case is exactly the in-flight one.

## Consequences

- The `assignments` row stays `accepted` while the job is in flight, so
  `reassign` needs no new assignment state — the swap is revoke + accept.
- Field-execution follows the new agent: `Assignment.Accepted` on a job with
  an open `executions` row re-points `agent_id`/`assignment_id` to the
  incoming agent (completed/cancelled executions are untouched), so the job
  appears in the new agent's work list. Step progress and check-in state are
  preserved — the session represents the job's work, not the agent's stint.
- A reassigned agent inherits the job's workflow state as-is; steps already
  closed stay closed (the audit trail of who did the work lives in
  `executions`/`job_events`, not the assignment row).
- `Job.Reassigned` enters `EVENT_CATALOG.MD`; consumers that key on
  `Job.Assigned` for "job now has an agent" semantics should also handle
  `Job.Reassigned`.
