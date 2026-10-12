# ServIQ — Open-source Multi-Tenant Service Operations Platform

### Intelligent service operations, from request to completion.

**ServIQ** is an open-source, multi-tenant service operations platform built to connect **customers, service providers, and field service agents** through a single, end-to-end workflow.

Whether it's a delivery, appliance repair, installation, maintenance visit, or another on-demand service, ServIQ helps businesses manage the entire service lifecycle — from the moment a customer requests a service to the moment the job is completed.

### Why ServIQ?

Modern service businesses often rely on disconnected tools for customer requests, scheduling, dispatching, workforce management, communication, and job tracking.

**ServIQ brings these workflows together in one platform** — lightweight on
the surface, heavyweight underneath: every persona touches only the slice of
the product built for their role, while an event-driven microservice
architecture carries the complexity behind it.

```text
Customer
   │
   │ Service Request
   ▼
Service Provider
   │
   │ Schedule & Dispatch
   ▼
Service Agent
   │
   │ Execute Service
   ▼
Job Completion
   │
   ▼
Customer
```

### Built for different service businesses

ServIQ is designed around a generalized service model rather than a single industry, making it adaptable to:

- 🚚 Delivery and logistics
- 🔧 Appliance repair and maintenance
- 🛠️ Installation and field services
- 🏠 Home services
- 📦 Pickup and delivery
- 🧹 Cleaning and maintenance
- 🚗 Mobile and on-demand services

### Core Capabilities

- **Multi-tenancy** — Isolated businesses operating on a shared platform
- **Customer Management** — Manage customers and their service requests
- **Service Management** — Define and manage different types of services
- **Work Orders** — Track the complete lifecycle of a service job
- **Dispatch & Assignment** — Assign jobs to available field agents
- **Customer Portal** — Handle the customer onboarding, browsing, booking, and tracking portal functionality
- **Customer Support** — Handle support cases, complaints, follow-ups, and escalations
- **Finance & Accounting** — Track tenant income, platform fees, payouts, refunds, and settlements
- **Scheduling** — Coordinate appointments and service windows
- **Field Operations** — Give service agents the tools they need to execute jobs
- **Real-time Tracking** — Monitor active service operations
- **Notifications** — Keep customers and service teams informed
- **AI Assistant** — Per-persona chat (customer, dispatcher, support) powered by a local Ollama LLM, calling domain APIs through a strict per-profile tool boundary with the caller's own permissions
- **Document Intelligence** — Vision-model parsing of payment evidence — receipts and deposit slips — into structured data for billing review
- **Role-Based Access Control** — Control access across platform and tenant roles
- **Audit Trail** — Maintain a history of important operational events
- **API-first Architecture** — Designed for web, mobile, and third-party integrations

### Designed as a Real-World SaaS Platform

ServIQ is intentionally designed beyond a simple CRUD application. The project explores the architecture and engineering challenges found in modern multi-tenant SaaS and field-service platforms, including **tenant isolation, distributed workflows, asynchronous processing, real-time communication, API design, security, observability, and scalable service orchestration**.

The project is developed as an open-source reference implementation and an ongoing exploration of modern full-stack engineering practices.

### Running locally

```bash
./scripts/install.sh   # env setup + staged bring-up: infra → domain → AI → frontends
```

Frontends serve on 3000–3003 (vite dev servers with hot reload), BFFs on
8000–8001, domain APIs on 8010–8021. The script ends with smoke checks
against every service. The compose stack is the dev environment — source is
bind-mounted and code changes are live without rebuilds. See
[Local Development](workspace/specs/technical/infrastructure/LOCAL_DEVELOPMENT.MD)
for how it's wired.

### Local seed accounts

Demo accounts for immediate testing — **local development only, never use
these credentials elsewhere.** Seeding runs automatically in the service
containers on install; see [Local Development](workspace/specs/technical/infrastructure/LOCAL_DEVELOPMENT.MD#local-seed-accounts)
for how it works and how to re-seed.

| Role | Login URL | Username | Password |
|---|---|---|---|
| Platform Administrator | http://localhost:3003/login | `admin` | `serviq-local` |
| Tenant Administrator | http://localhost:3002/provider/acme/login | `acme.admin` | `demo-pass-123` |
| Service Agent | http://localhost:3001/provider/acme/login | `anna.agent` | `demo-pass-123` |
| Customer | http://localhost:3000/provider/acme/login | `jane.customer` | `demo-pass-123` |

Tenant-scoped logins (everyone except the Platform Administrator) need the
provider slug `acme` — the `/provider/acme/login` URLs above pre-fill it, or
type `acme` into the **Provider** field on the plain `/login` page.

Auth routes are throttled at 5 req/min — rapid login attempts will hit 429s.

### Related Documentation

- [Project Purpose](workspace/specs/PROJECT_PURPOSE.MD) — portfolio goals and the engineering capabilities this project demonstrates
- [App Features by Portal](APP_FEATURES.MD) — feature inventory per portal: ✅ implemented, unmarked proposed
- [Workspace Specs Index](workspace/specs/README.MD)
- [Engineering Disciplines](workspace/specs/technical/README.MD)
- [User Experience](workspace/specs/technical/user_experience/README.MD)
- [Glossary & Vocabulary](workspace/specs/GLOSSARY.MD)
- [Domain Documentation](workspace/specs/domain/README.MD)
- [Domain Boundaries](workspace/specs/domain/specs/DOMAIN_BOUNDARIES.md)

---

### Author

**Erickson Reyes** — Software Architect, spec-driven AI-orchestrated delivery

> "I design systems and write executable specifications; AI agents implement against them across whatever language the service needs. My job is architecture, contracts, and verification — the code is a build artifact."

ServIQ is the proof of that approach: a polyglot platform — Laravel, Express, FastAPI, and React services — designed and delivered by one engineer directing AI implementation through a canonical spec tree, architecture decision records, and verification discipline. Stack-appropriate, not stack-bound.

Implementation agent: **[Devin](https://devin.ai)** — AI software engineer by Cognition.

---

**ServIQ — Connect. Dispatch. Serve.**