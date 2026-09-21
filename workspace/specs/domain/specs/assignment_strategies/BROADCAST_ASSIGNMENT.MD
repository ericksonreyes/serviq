# Broadcast Assignment
ServIQ broadcasts the same job offer to multiple eligible service agents simultaneously. The first qualified agent to accept wins the assignment, ideal for on-demand and time-sensitive services.

### Basic flow

```text
Customer
   │
   │ Service Request
   ▼
Service Job
   │
   │ Assignment Mode = BROADCAST
   ▼
ServIQ Assignment Engine
   │
   │ Find eligible agents
   ▼
┌──────────┬──────────┬──────────┐
│          │          │          │
▼          ▼          ▼          ▼
John      Maria      Pedro      Ana
Offer     Offer      Offer      Offer
 │          │          │          │
 │          │          │          │
 ▼          ▼          ▼          ▼
Accept    Decline    No action   Accept
   │                              │
   └──────────────┬───────────────┘
                  ▼
             First valid
               acceptance
                  │
                  ▼
             Service Job
              Assigned
                  │
                  ▼
            Other offers
              revoked
```

### Example

A customer requests:

> **Refrigerator repair — ₱1,500 — Antipolo — ASAP**

ServIQ determines that five agents are eligible.

It broadcasts:

```text
JOB-1025

Available Service Job
────────────────────────
Refrigerator Repair
Antipolo
ASAP
Estimated: ₱1,500
```

John, Maria, Pedro, Ana and Mark may receive the offer.

Maria accepts first.

```text
Maria → ACCEPTED
John  → Offer Revoked
Pedro → Offer Revoked
Ana   → Offer Revoked
Mark  → Offer Revoked
```

The resulting relationship becomes:

```text
Service Job
     │
     ▼
Assignment
     │
     ▼
Maria
```

---

## Broadcast vs Self-Assignment

They're similar, but there's an important distinction.

### Self-Assignment

Agents **browse available jobs** and decide which ones they want.

```text
Available Jobs
     │
     ├── Job A
     ├── Job B
     └── Job C
          │
          ▼
       Agent chooses
```

The platform doesn't necessarily push a specific job to them.

### Broadcast Assignment

ServIQ **actively offers a specific job** to selected agents.

```text
                 Service Job
                      │
                      ▼
               Broadcast Engine
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
        John        Maria       Pedro
        Offer       Offer       Offer
          │           │           │
          └───────────┼───────────┘
                      ▼
               First acceptance
```

That's an important domain distinction.

---

# You can make Broadcast smarter

You don't necessarily need to broadcast to **every** Service Agent.

For example:

### Radius-based

```text
Broadcast radius: 5 km
```

Only nearby agents receive it.

### Skill-based

```text
Required skill:
Air Conditioner Repair
```

Only qualified agents receive it.

### Service-area based

```text
Service area:
Antipolo
```

### Tiered broadcast

This is particularly interesting:

```text
Round 1
────────────────
Agents within 3 km
Timeout: 30 sec

        ↓ nobody accepts

Round 2
────────────────
Agents within 5 km
Timeout: 60 sec

        ↓ nobody accepts

Round 3
────────────────
Agents within 10 km

        ↓ nobody accepts

Dispatcher Queue
```

Now you've got an actual **dispatch orchestration engine**.

---

# One tricky problem: simultaneous acceptance

Suppose:

```text
10:32:01.120  John    ACCEPT
10:32:01.135  Maria   ACCEPT
10:32:01.142  Pedro   ACCEPT
```

Your backend has to guarantee that **only one agent wins**.

Conceptually:

```text
                Broadcast Offer
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
           John      Maria      Pedro
             │         │         │
           Accept    Accept     Accept
             │         │         │
             └─────────┼─────────┘
                       ▼
                 Atomic decision
                       │
                       ▼
                  ONE winner
                       │
              ┌────────┴────────┐
              ▼                 ▼
           Assigned        Others revoked
```

That's an excellent opportunity to demonstrate real backend engineering:

- Database transactions
- Optimistic/pessimistic locking
- Idempotency
- Race-condition handling
- Event processing
- WebSockets/push notifications
- Assignment expiration
- Retry handling
- Audit logs

---

## So your ServIQ assignment strategies could become

```text
                    Service Job
                         │
                  Assignment Mode
                         │
       ┌─────────┬───────┼─────────┬──────────┐
       │         │       │         │          │
       ▼         ▼       ▼         ▼          ▼
 Dispatcher  Automatic  Self-    Broadcast  Hybrid
 Assignment  Assignment Assignment Assignment
```

And **Hybrid** could eventually combine them:

```text
Automatic
    ↓
Broadcast
    ↓
Dispatcher
```

For example:

> "Try automatic assignment first. If nobody is available, broadcast to qualified agents. If nobody accepts within 2 minutes, send it to the dispatcher."

That's the kind of workflow that would make **ServIQ feel like a genuine service-operations platform rather than a portfolio CRUD application.**