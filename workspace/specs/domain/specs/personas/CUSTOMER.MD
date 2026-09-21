# Customer

**Example:** Alice Santos

Alice uses ServIQ to request a service.

```text
Alice
 │
 ├── Select service
 │      "Refrigerator Repair"
 │
 ├── Provide location
 │
 ├── Select preferred schedule
 │
 └── Submit request
             │
             ▼
        QuickFix
             │
             ▼
        Dispatcher
             │
             ▼
           John
```

Alice can then see:

```text
Request #REQ-10234

Status: Technician Assigned

Technician:
John Dela Cruz

Scheduled:
September 23, 2026
10:00 AM

Status:
✓ Request received
✓ Technician assigned
○ Technician en route
○ Service started
○ Completed
```
