# Self Assignment
Service agents browse and accept available jobs themselves based on their availability, location, and skills, rather than being assigned by a dispatcher.

### Two possible fulfillment models

#### 1. Dispatcher-controlled

Typical for larger operations:

```text
Customer
   │
   ▼
Service Request
   │
   ▼
Dispatcher
   │
   ▼
Service Agent
   │
   ▼
Accept → Execute → Complete
```

The dispatcher chooses who gets the job.

---

#### 2. Agent self-acceptance

Useful for smaller businesses, gig workers, and on-demand services:

```text
Customer
   │
   ▼
Service Request
   │
   ▼
Available Service Agents
   │
   ├── John → Accept
   ├── Maria
   └── Pedro
          │
          ▼
      Service Job
```

For example, a customer requests:

> **Aircon cleaning — ₱1,500 — Saturday 10 AM**

Eligible agents see the request and one of them accepts it.

Once John accepts:

```text
Service Request
       │
       ▼
    Accepted
       │
       ▼
Assigned to John
       │
       ▼
   In Progress
       │
       ▼
   Completed
```

### This actually gives ServIQ a stronger domain model

Instead of:

> Dispatcher assigns Service Agent

make the relationship:

> **Service Job is fulfilled through an Assignment.**

An assignment can happen through different strategies:

```text
Assignment Method

MANUAL
  Dispatcher assigns Agent

SELF_ACCEPT
  Agent accepts available Job

AUTO_ASSIGN
  ServIQ automatically assigns Agent

BROADCAST
  Job offered to multiple eligible Agents
```

This is much more extensible.

### Your Service Provider could configure this

For example:

```text
QuickFix Appliance Services

Assignment Mode:
○ Dispatcher Only
● Agent Self-Accept
○ Automatic Assignment
```

While another tenant could use:

```text
FastDelivery Inc.

Assignment Mode:
○ Dispatcher Only
○ Agent Self-Accept
● Automatic Assignment
```

And a gig-style business might use:

```text
OnDemand Services

Assignment Mode:
○ Dispatcher Only
○ Agent Self-Accept
○ Automatic Assignment
● Broadcast
```

### I'd therefore modify the persona relationship

The **Dispatcher is not necessarily above the Service Agent**.

They're different operational roles:

```text
                 Service Provider
                        │
             ┌──────────┴──────────┐
             │                     │
        Dispatcher            Service Agents
             │                     │
             │                     │
             └─────── Service Job ─┘
                         │
                    Assignment
```

The Dispatcher **may participate in the assignment**, but the Service Agent can also participate directly.

That makes ServIQ applicable to both **traditional field-service companies and marketplace/gig-style service businesses**.

And from a software-engineering perspective, this is a much richer problem because you can demonstrate **configurable workflows rather than hard-coded business rules**.