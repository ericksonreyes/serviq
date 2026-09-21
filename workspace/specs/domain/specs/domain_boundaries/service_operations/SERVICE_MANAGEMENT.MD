# Service Management

### Responsibility

**What services does a Service Provider offer?**

Example:

```text
QuickFix Appliance Services
        │
        ├── Refrigerator Repair
        ├── Washing Machine Repair
        ├── AC Maintenance
        └── Dishwasher Installation
```

A Service can contain:

```text
Service
├── Name
├── Description
├── Pricing
├── Estimated Duration
├── Required Skills
├── Service Areas
└── Workflow Template
```

This context defines **what can be requested**.

It does not decide which Service Agent performs the job.

### Workflow templates

Different services need different workflows. Each Service carries a **workflow template**: an ordered list of steps
that a job for that service moves through.

Template steps are ordered, and tenant admins can reorder them by drag-and-drop in the management UI. Reordering a
template affects new jobs only — in-flight jobs keep the step order they were created with.

```text
Workflow Template
├── Ordered Steps
│   └── Step: name, optional required evidence (photo, signature, notes)
└── Terminal states: completed (final step closed) or cancelled
```

Example templates per service type:

```text
One Way Logistics  → For Pick Up → Picked Up → In Transit → Delivered
Rider Delivery     → For Pick Up → Picked Up → In Transit → Delivered → Returning → Returned
Transport          → For Pick Up → Picked Up → In Transit → Arrived
Services           → Booked → Serviced
Food Delivery      → Preparing → Picked Up → On The Way → Delivered → Returning → Returned
```

**Cancelled** is a terminal job state reachable from any step, not a sequential step in the pipeline.

### Step states

During execution, each step in a job's instantiated workflow moves through:

```text
open → in-progress → closed
```

- **open** — the step is pending; earlier steps are not yet complete
- **in-progress** — the step is actively being worked
- **closed** — the step's end state; the next step becomes available

A job completes when its final step is closed.
