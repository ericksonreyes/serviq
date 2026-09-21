Absolutely. I’d update the documentation to reflect the decisions we made afterward—especially **Platform Management**,
the distinction between **Service Provider vs. Service Agent**, and the four assignment strategies.

# ServIQ — Domain Model & Bounded Contexts

## 1. Overview

**ServIQ** is an open-source, multi-tenant service operations platform designed to connect customers, service providers,
dispatchers, and field service agents through an end-to-end service lifecycle.

> **ServIQ — Intelligent service operations, from request to completion.**

The platform is designed to support different service businesses, including:

- Delivery and logistics
- Appliance repair
- Installation
- Maintenance
- Cleaning
- Home services
- Field support
- Other on-demand services

The architecture is based on **Domain-Driven Design (DDD)**, with clearly defined bounded contexts responsible for
specific business capabilities.

---

# 2. Core Business Personas

ServIQ separates the people and organizations involved in operating the platform.

```text
                         SERVIQ
                            │
             ┌──────────────┴──────────────┐
             │                             │
     Platform Administrator          Service Provider
             │                             │
       Manages ServIQ              Operates a business
                                           │
                              ┌────────────┼────────────┐
                              │            │            │
                           Tenant      Dispatcher   Service Agent
                           Admin                       │
                                                       │
                                                       ▼
                                                   Customer
```

### Platform Administrator

Manages the **ServIQ platform itself**.

Examples:

- Tenant lifecycle
- Platform configuration
- Subscriptions
- Plans
- Feature flags
- Platform policies
- Platform-wide administration

A Platform Administrator normally does **not** manage individual service jobs.

---

### Service Provider

A **business or organization offering services through ServIQ**.

Examples:

```text
QuickFix Appliance Services
ABC Home Maintenance
FastDelivery Logistics
XYZ Cleaning Services
```

A Service Provider is an organization—not an individual user.

---

### Tenant Administrator

Manages a Service Provider's ServIQ environment.

Examples:

- Users
- Services
- Service Agents
- Business configuration
- Service areas
- Tenant settings

---

### Dispatcher

Handles day-to-day service operations.

Examples:

- Assign jobs
- Monitor active jobs
- Reschedule jobs
- Reassign jobs
- Manage the dispatcher queue

A Dispatcher is an operational role, not necessarily a hierarchy above Service Agents.

---

### Service Agent

The person who performs the service.

Examples:

- Delivery rider
- Driver
- Appliance technician
- Installer
- Maintenance worker
- Cleaning specialist
- Field engineer

The term **Service Agent** intentionally keeps ServIQ industry-neutral.

---

### Customer

The person or organization requesting and receiving a service.

---

# 3. Platform Architecture

The current bounded-context model is:

```text
┌───────────────────────────────────────────────────────────────┐
│                         SERVIQ PLATFORM                       │
│                                                               │
│  ┌──────────────────────┐    ┌────────────────────────────┐   │
│  │ Platform Management  │    │    Identity & Access       │   │
│  │                      │    │                            │   │
│  │ Tenants              │    │ Users                      │   │
│  │ Subscriptions        │    │ Roles                      │   │
│  │ Plans                │    │ Permissions                │   │
│  │ Feature Flags        │    │ Authentication             │   │
│  │ Platform Policies    │    │ Authorization              │   │
│  └──────────┬───────────┘    └────────────────────────────┘   │
│             │                                                 │
│             │ Tenant Boundary                                 │
│             ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    TENANT / BUSINESS                    │  │
│  │                                                         │  │
│  │  ┌───────────────┐      ┌──────────────────────────┐    │  │
│  │  │    Service    │      │ Customer & Request       │    │  │
│  │  │   Management  │      │ Management               │    │  │
│  │  └───────┬───────┘      └─────────────┬────────────┘    │  │
│  │          │                            │                 │  │
│  │          └────────────┬───────────────┘                 │  │
│  │                       ▼                                 │  │
│  │                ┌───────────────┐                        │  │
│  │                │ Service Job   │                        │  │
│  │                │  Management   │                        │  │
│  │                └───────┬───────┘                        │  │
│  │                        │                                │  │
│  │             ┌──────────┴──────────┐                     │  │
│  │             ▼                     ▼                     │  │
│  │      ┌──────────────┐     ┌────────────────────┐        │  │
│  │      │  Workforce   │────▶│ Assignment &       │        │  │
│  │      │  Management  │     │ Dispatch           │        │  │
│  │      └──────────────┘     └─────────┬──────────┘        │  │
│  │                                     │                   │  │
│  │                                     ▼                   │  │
│  │                           ┌────────────────────┐        │  │
│  │                           │ Field Service      │        │  │
│  │                           │ Execution          │        │  │
│  │                           └─────────┬──────────┘        │  │
│  │                                     │                   │  │
│  └─────────────────────────────────────┼───────────────────┘  │
│                                        │                      │
│                              ┌─────────▼─────────┐            │
│                              │   Notification     │           │
│                              └────────────────────┘           │
└───────────────────────────────────────────────────────────────┘
```

Customer Portal is a customer-facing context family that handles signup, browsing, booking, tracking, and other self-service interactions inside the Service Provider's app or website.

Finance & Accounting is a tenant-level context family that consumes service-job completion, payment, refund, and settlement events to manage revenue, platform fees, payouts, and reporting.

Service Agent Portal is a service-agent-facing presentation channel, not a separate bounded context. It sits across Service Operations and Finance & Accounting and is used to accept assignments, view jobs, upload photos, upload proof of payment, capture customer confirmation, and complete field work.

---

# 4. Bounded Contexts

See the grouped family indexes for detailed definitions:

- [Domain Boundaries Index](domain_boundaries/README.MD)
- [Glossary & Vocabulary](../../GLOSSARY.MD)
- [Platform & Identity](domain_boundaries/platform/README.MD)
- [Service Operations](domain_boundaries/service_operations/README.MD)
- [Customer Portal](domain_boundaries/customer_portal/README.MD)
- [Finance & Accounting](domain_boundaries/finance/README.MD)

---

# 15. The Most Important Domain Separation

ServIQ intentionally separates three concepts:

```text
┌────────────────────────────────────┐
│ SERVICE JOB                        │
│                                    │
│ "What needs to be done?"           │
└──────────────────┬─────────────────┘
                   │
                   ▼
┌────────────────────────────────────┐
│ ASSIGNMENT                         │
│                                    │
│ "Who is responsible for doing it?" │
└──────────────────┬─────────────────┘
                   │
                   ▼
┌────────────────────────────────────┐
│ FIELD EXECUTION                    │
│                                    │
│ "How was the work performed?"      │
└────────────────────────────────────┘
```

This is preferable to simply having:

```text
ServiceJob
    │
    └── service_agent_id
```

Instead:

```text
ServiceJob
     │
     ▼
Assignment
     │
     ▼
ServiceAgent
```

This allows ServIQ to support:

- Reassignment
- Rejection
- Automatic assignment
- Broadcast assignment
- Self-assignment
- Assignment history
- Assignment expiration
- Multiple assignment attempts

without changing the underlying Service Job.

---

# 16. Example End-to-End Workflow

Consider:

> Alice wants her washing machine repaired.

```text
Customer
   │
   │ Service Request
   ▼
Service Request
"Repair washing machine"
   │
   ▼
Service Job
JOB-1001
   │
   │ Assignment Strategy:
   │ AUTOMATIC
   ▼
Assignment Engine
   │
   ├── Find eligible agents
   ├── Check skills
   ├── Check availability
   ├── Check service area
   └── Score candidates
   │
   ▼
John
   │
   │ Assignment
   ▼
John rejects
   │
   ▼
Next Candidate
   │
   ▼
Maria accepts
   │
   ▼
Field Execution
   │
   ├── Check-in
   ├── Diagnose
   ├── Repair
   ├── Parts Used
   ├── Photos
   └── Complete
   │
   ▼
Customer Confirmation
   │
   ▼
Service Job Completed
```

The Service Job remained:

```text
JOB-1001
Repair washing machine
```

The assignment changed:

```text
John  → Rejected
Maria → Accepted
```

And the field execution produced the actual outcome.

---

# 17. Context Responsibilities at a Glance

| Context                           | Primary Question                       |
|-----------------------------------|----------------------------------------|
| **Platform Management**           | How is ServIQ itself operated?         |
| **Identity & Access**             | Who is this user and what can they do? |
| **Service Management**            | What services does the business offer? |
| **Customer & Request Management** | What does the customer want?           |
| **Customer Portal**               | How does the customer use the portal through the Service Provider? |
| **Service Job Management**        | What work needs to be performed?       |
| **Finance & Accounting**          | How does money move through ServIQ?    |
| **Workforce Management**          | Who is capable of performing the work? |
| **Assignment & Dispatch**         | Who should perform the work, and how?  |
| **Field Service Execution**       | How was the work performed?            |
| **Notification**                  | How should users be informed?          |

---

# 18. Platform vs. Tenant Responsibility

One of the most important architectural boundaries is the distinction between **platform administration** and **business
operations**.

```text
                         SERVIQ
                            │
                            ▼
                 Platform Management
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
           Tenant A      Tenant B      Tenant C
              │             │             │
              ▼             ▼             ▼
        Business Ops   Business Ops   Business Ops
```

Platform Administrator:

```text
✓ Create tenant
✓ Suspend tenant
✓ Manage plans
✓ Manage subscriptions
✓ Configure platform
✓ Manage feature flags
✓ Review tenant income, platform fee income, and settlement status
```

Tenant Administrator:

```text
✓ Manage users
✓ Configure services
✓ Manage service agents
✓ Configure business settings
✓ Manage operational workflows
✓ Review revenue, invoices, refunds, and payout status
```

Dispatcher:

```text
✓ Assign jobs
✓ Monitor jobs
✓ Reassign jobs
✓ Manage operational queue
```

Service Agent:

```text
✓ Accept jobs
✓ Perform service
✓ Update execution status
✓ Submit proof of service
```

This separation prevents the platform-level concerns from becoming coupled to individual tenant operations.

---

# 19. Initial ServIQ Bounded Context Map

For the initial implementation, I would consider these the **core contexts**:

```text
                         SERVIQ
                            │
            ┌───────────────┴────────────────┐
            │                                │
            ▼                                ▼
  Platform Management                Identity & Access
            │
            │ Tenant Boundary
            ▼
 ┌────────────────────────────────────────────────────┐
 │                    TENANT                          │
 │                                                    │
 │  ┌──────────────┐       ┌─────────────────────┐    │
 │  │   Service    │       │ Customer & Request  │    │
 │  │  Management  │       │     Management      │    │
 │  └──────┬───────┘       └──────────┬──────────┘    │
 │         │                           │              │
 │         └────────────┬──────────────┘              │
 │                      ▼                             │
 │               ┌──────────────┐                     │
 │               │ Service Job  │                     │
 │               │  Management  │                     │
 │               └──────┬───────┘                     │
 │                      │                             │
 │               ┌──────────────┐                     │
 │               │ Finance &    │                     │
 │               │ Accounting   │                     │
 │               └──────────────┘                     │
 │            ┌─────────┴─────────┐                   │
 │            ▼                   ▼                   │
 │     ┌─────────────┐    ┌──────────────────┐        │
 │     │  Workforce  │───▶│ Assignment &     │        │
 │     │ Management  │    │ Dispatch         │        │
 │     └─────────────┘    └────────┬─────────┘        │
 │                                 │                  │
 │                                 ▼                  │
 │                       ┌──────────────────┐         │
 │                       │ Field Service    │         │
 │                       │ Execution        │         │
 │                       └──────────────────┘         │
 │                                                    │
 └────────────────────────────────────────────────────┘
                            │
                            ▼
                      Notification
```

---

# 20. Future Bounded Contexts

These can be added as ServIQ evolves:

```text
Customer Support
Taxation
Reconciliation
Revenue Recognition
Expense Management
Reporting & Analytics
Integrations
Pricing
SLA Management
Audit & Compliance
Asset Management
Inventory / Parts
```

They should not necessarily be implemented in the first version.

The goal is to keep the initial system **architecturally clean without prematurely building an entire enterprise
platform**.

---

## 21. Core Architectural Principle

The central idea behind ServIQ is:

```text
Platform
   │
   ▼
Tenant
   │
   ▼
Customer Request
   │
   ▼
Service Job
   │
   ▼
Assignment
   │
   ▼
Service Agent
   │
   ▼
Field Execution
   │
   ▼
Completion
```

With each stage owned by an appropriate domain.

This gives ServIQ a strong foundation for demonstrating:

- Domain-Driven Design
- Multi-tenancy
- Role-based access control
- Configurable workflows
- Assignment algorithms
- Event-driven architecture
- Concurrency handling
- Async processing
- Auditability
- Scalable service boundaries
- Real-world business rules

**The most important architectural principle is that ServIQ models the business capabilities separately rather than
turning the entire application into one large "Service" or "Order" domain.**