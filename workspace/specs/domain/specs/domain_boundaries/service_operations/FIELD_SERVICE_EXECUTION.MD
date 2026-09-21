# Field Service Execution

Once an agent accepts the assignment, the system transitions into **field execution**.

### Responsibility

**How is the work actually performed?**

Core concepts:

```text
Check-in
Work Started
Work Notes
Photos
Parts Used
Customer Signature
Proof of Service
Completion
```

Execution is driven by the job's **workflow instance** — the step pipeline copied from the service's workflow
template. The agent advances the job step by step:

```text
Assignment
    │
    ▼
Agent Arrives / Check-in
    │
    ▼
For each step in the workflow instance:
    │
    ├── open → in-progress (agent starts the step)
    ├── collect required evidence (photos, signature, notes)
    └── in-progress → closed (step's end state)
    │
    ▼
Final step closed → Job Completed
    │
    ▼
Customer Confirmation
```

The steps themselves come from the service's template — a delivery job walks `For Pick Up → Picked Up → In Transit →
Delivered`, while a service job might only walk `Booked → Serviced`. Field Service Execution records *what actually
happened* at each step; it does not define the steps.
