# Assignment & Dispatch

This is one of the most interesting domains in ServIQ.

### Responsibility

**Who should perform the Service Job, and how should the job be assigned?**

Core concepts:

```text
Assignment
Assignment Strategy
Dispatcher Assignment
Self-Assignment
Automatic Assignment
Broadcast Assignment
Assignment Rules
Assignment Offers
Assignment Expiration
Reassignment
Assignment History
```

---

## Assignment Strategy

ServIQ supports multiple assignment strategies.

```text
                         Service Job
                              │
                              ▼
                    Assignment Strategy
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
 Dispatcher             Automatic            Broadcast
 Assignment             Assignment           Assignment
          │                   │                   │
          ▼                   ▼                   ▼
     Dispatcher          Assignment          Eligible
                         Engine              Agents
                                                  ▲
                                                  │
                                           Self-Assignment
```

### 1. Dispatcher Assignment

The Dispatcher explicitly selects an agent.

```text
Service Job
     │
     ▼
Dispatcher
     │
     │ assigns
     ▼
Service Agent
```

This is the preferred domain term instead of simply "Manual Assignment."

---

### 2. Self-Assignment

Agents browse eligible jobs and choose which jobs they want to accept.

```text
Available Jobs
      │
      ▼
Service Agent
      │
      │ chooses
      ▼
Assignment
```

This is useful for businesses that give agents more autonomy.

At the business-model level, this can be described as:

**Agent Autonomy**

But the actual workflow/domain operation is:

**Self-Assignment**

---

### 3. Automatic Assignment

ServIQ's assignment engine determines which eligible agent should receive the job.

```text
Service Job
     │
     ▼
Assignment Engine
     │
     ▼
Find Eligible Agents
     │
     ├── Skills
     ├── Service Area
     ├── Availability
     ├── Capacity
     ├── Workload
     └── Other Rules
     │
     ▼
Score Candidates
     │
     ▼
Select Agent
     │
     ▼
Create Assignment
```

Potential strategies include:

```text
Nearest Agent
Best Match
Least Loaded
Round Robin
Fair Distribution
SLA-Based
```

The actual strategy and weighting should be configurable by the Service Provider.

---

### 4. Broadcast Assignment

ServIQ actively offers a job to multiple eligible agents.

```text
Service Job
     │
     ▼
Assignment Engine
     │
     ▼
Eligible Agents
     │
 ┌───┼─────┐
 ▼   ▼     ▼
John Maria Pedro
 │    │    │
 └────┼────┘
      │
      ▼
First Valid Acceptance
      │
      ▼
Assignment Created
```

Once one agent accepts:

```text
Maria → Accepted
John  → Offer Revoked
Pedro → Offer Revoked
```

This is fundamentally different from Self-Assignment.

```text
SELF-ASSIGNMENT
Agent searches for jobs
        ↓
Agent chooses job


BROADCAST
System selects eligible agents
        ↓
System offers job
        ↓
Agent accepts
```

---

## Assignment Concurrency

Broadcast Assignment introduces an important engineering problem.

What happens if:

```text
09:00:00.100  John accepts
09:00:00.105  Maria accepts
09:00:00.107  Pedro accepts
```

ServIQ must guarantee that **only one agent wins**.

The Assignment domain therefore needs to address:

- Database transactions
- Concurrency control
- Race conditions
- Idempotency
- Assignment state transitions
- Offer expiration
- Rejected assignments
- Reassignment
- Assignment history

For example:

```text
JOB-1025
   │
   ├── Assignment #1
   │      └── John → Rejected
   │
   ├── Assignment #2
   │      └── Maria → Accepted
   │
   └── Field Execution
```

This is a strong example of the type of real-world engineering problem ServIQ is intended to demonstrate.

---

## Automatic Assignment Fallback

Automatic assignment should not assume that a suitable agent will always exist.

```text
             Service Job
                  │
                  ▼
          Automatic Assignment
                  │
                  ▼
        Find Eligible Agents
                  │
          ┌───────┴────────┐
          │                │
       Found              None
          │                │
          ▼                ▼
    Select Agent      Dispatcher Queue
          │
          ▼
      Assignment
```

A more sophisticated configuration could be:

```text
Automatic
    ↓
Broadcast
    ↓
Dispatcher Queue
```

This allows a Service Provider to define operational fallback rules.
