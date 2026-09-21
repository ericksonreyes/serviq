# Dispatcher Assignment

A dispatcher manually evaluates and assigns service agents to jobs based on location, availability, skills, and service area. Agents can accept or reject assignments.

### The basic concept

```text
Customer
   │
   │ Service Request
   ▼
Service Job
   │
   │ Dispatcher selects agent
   ▼
Dispatcher
   │
   │ Assignment
   ▼
Service Agent
   │
   │ Accepts assignment
   ▼
Service Job
   │
   │ Execute
   ▼
Completed
```

The important distinction is:

> **Service Request** = what the customer asks for  
> **Service Job** = the actual work that needs to be performed  
> **Assignment** = who is responsible for performing that job

---

### Example

Alice requests:

> "Repair my washing machine tomorrow at 10 AM."

ServIQ creates:

```text
Service Request
REQ-10025
    │
    ▼
Service Job
JOB-10025
    │
    │ Dispatcher evaluates:
    │ • Location
    │ • Availability
    │ • Skills
    │ • Service area
    ▼
Dispatcher
    │
    │ Assign
    ▼
John (Service Agent)
```

The system then creates an **Assignment**:

```text
Assignment
────────────────────
Job:       JOB-10025
Agent:     John
Assigned:  Sep 21, 2026 6:30 PM
Scheduled: Sep 22, 2026 10:00 AM
Assigned By: Lisa
Status:    Pending Acceptance
```

John then accepts:

```text
Dispatcher
     │
     │ assigns
     ▼
 Assignment
     │
     │ accepted
     ▼
 Service Agent
     │
     ▼
 In Progress
     │
     ▼
 Completed
```

### What if John rejects it?

That's where having **Assignment as its own entity** becomes useful.

```text
Service Job
     │
     ├── Assignment #1 → John → Rejected
     │
     ├── Assignment #2 → Maria → Accepted
     │
     └── Assignment #3 → Pedro → Cancelled
```

The **Service Job remains the same**. You're simply changing who is assigned to perform it.

---

## Dispatcher vs Service Agent

I'd model their responsibilities like this:

```text
                    Service Job
                         │
                         ▼
                    Dispatcher
                         │
                 ┌───────┴───────┐
                 │   Assignment  │
                 └───────┬───────┘
                         │
                         ▼
                   Service Agent
                         │
                  Accept / Reject
                         │
                         ▼
                  Execute Service
```

The Dispatcher **controls assignment**.

The Service Agent **controls acceptance and execution**.

---

## And this gives you a nice generalized model

ServIQ could support several assignment mechanisms:

```text
                     Service Job
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            ▼
         Dispatcher    Auto-Assign   Self-Accept
          Assignment    Assignment    Assignment
             │            │            │
             └────────────┼────────────┘
                          ▼
                    Service Agent
```

So in your domain model, I would use:

**`ServiceJob` → `Assignment` → `ServiceAgent`**

rather than putting something like `service_agent_id` directly on `ServiceJob`.

That gives ServIQ room to support **manual dispatch, automatic assignment, agent self-acceptance, reassignment, rejection, and assignment history** without redesigning the core domain later.