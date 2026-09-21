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
