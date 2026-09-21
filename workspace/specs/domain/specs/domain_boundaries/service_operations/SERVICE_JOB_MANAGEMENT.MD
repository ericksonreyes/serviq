# Service Job Management

### Responsibility

**What work needs to be performed?**

This is the core transactional domain.

```text
Service Job
├── Job Status
├── Work Items
├── Schedule
├── Service Location
└── Job History
```

Typical lifecycle:

```text
Requested
    │
    ▼
Confirmed
    │
    ▼
Ready for Assignment
    │
    ▼
Assigned
    │
    ▼
Accepted
    │
    ▼
In Progress
    │
    ▼
Completed
```

The Service Job context owns the **job lifecycle**.

However, it should not own the actual assignment algorithm.

### Instantiated workflow

When a job is created for a Service, it copies that service's **workflow template** into an instance the job tracks.
While the job is `In Progress`, its current position is expressed through the template's steps:

```text
Service Job
├── Job Status (lifecycle: Requested → ... → Completed / Cancelled)
└── Workflow Instance
    └── Steps: open → in-progress → closed
```

- The job lifecycle answers *where the job is* for the business (requested, assigned, in progress, completed).
- The workflow instance answers *where the work is* for the agent and customer (e.g., `Picked Up`, `In Transit`).
- A job is `Completed` when its final step is closed, or `Cancelled` from any step.

The workflow instance is a snapshot: later edits to the service's template do not rewrite in-flight jobs.

Steps on an in-flight job can still be reordered by drag-and-drop in the UI, with limits:

- **open** steps may be reordered
- **in-progress** and **closed** steps are locked — work already started or finished cannot be moved

### Domain events

Because workflow steps are tenant-defined data, other contexts must not depend on step names. The job publishes two
layers of events:

- **Fixed lifecycle events** — predictable; other domains rely on these:
  - `JobRequested`, `JobAssigned`, `JobStarted`, `JobCompleted`, `JobCancelled`
- **Generic step events** — the step name is data in the payload, not the event type:
  - `WorkflowStepStarted { job_id, step_name, step_position }`
  - `WorkflowStepCompleted { job_id, step_name, step_position }`

A step like `Picked Up` never becomes an event type — it is `WorkflowStepCompleted` with `step_name: "Picked Up"`.

How consumers use this:

- **Notification** — templates key on the generic event with a `{{step_name}}` placeholder; tenants may add per-step
  template overrides
- **Customer Portal tracking** — renders the workflow instance's step list directly; it never needs to know what
  steps mean
- **Billing / Payouts** — react only to `JobCompleted`, a fixed lifecycle event
- **Read model projector** — stores step history as plain data

If a consumer ever needs step semantics (for example, "when the delivery step closes, do X"), the template can tag a
step with a **semantic kind** such as `pickup`, `delivery`, or `completion`. Consumers react to the kind, not the
tenant's label. Add this only when a real consumer needs it.
