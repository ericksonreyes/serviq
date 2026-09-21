# Customer & Request Management

### Responsibility

**What does the customer want?**

Core concepts:

```text
Customer
Service Request
Address
Contact Information
Preferred Schedule
Request Details
Attachments
```

Example:

```text
Customer
   │
   ▼
Service Request
"Repair refrigerator"
   │
   ├── Location
   ├── Photos
   ├── Preferred Time
   └── Notes
```

The request represents the customer's **intent**.

A request can eventually produce a Service Job.

```text
Service Request
       │
       ▼
   Service Job
```
