# Automatic Assignment
ServIQ automatically assigns jobs to the best-matching service agent using configurable scoring criteria like distance, availability, skills, workload, and performance history.


### Basic flow

```text id="bq5m9f"
Customer
   │
   │ Service Request
   ▼
Service Job
   │
   │ Assignment Strategy = AUTOMATIC
   ▼
ServIQ Assignment Engine
   │
   ├── Find eligible agents
   │
   ├── Filter
   │    ├── Required skills
   │    ├── Service area
   │    ├── Availability
   │    └── Agent status
   │
   ├── Calculate candidate scores
   │
   └── Select best candidate
   │
   ▼
Service Agent
   │
   │ Assignment
   ▼
Accept / Reject
   │
   ▼
Service Job
```

## Example

A customer requests:

> **Air-conditioner repair**  
> Location: Antipolo  
> Tomorrow, 10:00 AM

ServIQ finds five Service Agents:

```text id="0u7q2v"
John
✓ AC repair skill
✓ Antipolo service area
✓ Available
Distance: 3.2 km

Maria
✓ AC repair skill
✓ Antipolo service area
✓ Available
Distance: 5.1 km

Pedro
✗ Doesn't have AC repair skill

Ana
✓ AC repair skill
✗ Already assigned to another job

Mark
✓ AC repair skill
✓ Antipolo service area
✓ Available
Distance: 2.8 km
```

Pedro and Ana are eliminated.

The assignment engine evaluates:

```text id="0y2l2d"
                     Eligible Agents
                           │
                 ┌─────────┼─────────┐
                 │         │         │
               John      Maria      Mark
               3.2km     5.1km      2.8km
                 │         │         │
                 └─────────┼─────────┘
                           ▼
                     Scoring Engine
                           │
                           ▼
                         Mark
                           │
                           ▼
                     Assignment
```

Mark receives the job.

---

# How does ServIQ decide?

This is where you can make the project technically interesting.

You could have configurable **assignment criteria**:

### Eligibility

An agent must first satisfy mandatory requirements:

```text id="1v6t3g"
Service required
       ↓
Required skill ──────── ✓
Service area ────────── ✓
Availability ────────── ✓
Agent status ────────── ✓
Required certification ─ ✓
Maximum workload ────── ✓
```

Only then does ServIQ score the candidates.

### Example scoring

```text id="a5j1cv"
Candidate Score

Distance              30%
Availability          25%
Skill Match           20%
Current Workload      15%
Performance History   10%
```

For example:

```text id="c6sp8w"
John      82
Maria     74
Mark      91  ← selected
```

The exact weighting should be configurable by the Service Provider.

---

# What happens if the agent rejects?

This is important.

Don't immediately mark the Service Job as failed.

Instead:

```text id="7q8j5x"
                  Service Job
                       │
                       ▼
                Assignment Engine
                       │
                       ▼
                    Mark
                       │
                  Rejects
                       │
                       ▼
                Assignment Engine
                       │
                       ▼
                    Maria
                       │
                    Accepts
                       │
                       ▼
                  Assigned
```

The system maintains the history:

```text id="9m8z2k"
JOB-1025

Assignment #1
Mark → Rejected

Assignment #2
Maria → Accepted
```

That becomes valuable for auditing and analytics.

---

# You can also introduce assignment policies

For example:

### Nearest Agent

```text
Choose the closest eligible agent.
```

### Best Match

```text
Skill + availability + distance + workload
```

### Least Loaded

```text
Prefer agents with fewer active jobs.
```

### Round Robin

```text
John → Maria → Pedro → Ana → John...
```

### Fair Distribution

Try to distribute jobs evenly across agents.

### SLA-Based

Prioritize an agent who can reach the customer within the required response time.

---

# And this is where ServIQ gets interesting

I'd make **Assignment Strategy** configurable at the Service Provider level:

```text id="azl9bm"
Service Provider
       │
       ▼
Assignment Configuration
       │
       ├── Mode
       │    └── AUTOMATIC
       │
       ├── Eligibility Rules
       │    ├── Skills
       │    ├── Service Area
       │    └── Availability
       │
       ├── Selection Strategy
       │    ├── Best Match
       │    ├── Nearest
       │    ├── Least Loaded
       │    └── Fair Distribution
       │
       └── Fallback
            ├── Dispatcher
            └── Broadcast
```

So if the automatic engine can't find a suitable agent:

```text id="5g3w6m"
Automatic Assignment
        │
        ├── Agent found?
        │       │
        │      YES
        │       ↓
        │   Assignment
        │
        └── NO
            │
            ▼
       Dispatcher Queue
```

That **fallback to a dispatcher** is particularly useful in real-world operations.

### The three ServIQ fulfillment models then become very clean

```text id="f7g2q4"
                    SERVICE JOB
                         │
                  Assignment Mode
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
     DISPATCHER       AUTOMATIC      SELF-ASSIGN
     ASSIGNMENT       ASSIGNMENT     MENT
          │              │              │
          ▼              ▼              ▼
      Dispatcher      ServIQ         Agent
          │          Engine           │
          └──────────────┼─────────────┘
                         ▼
                  Service Agent
```

This is a **very good domain problem for ServIQ** because you're no longer building just CRUD screens. You're building an actual **service orchestration engine** with rules, state transitions, asynchronous processing, retries, fallback behavior, and auditability.