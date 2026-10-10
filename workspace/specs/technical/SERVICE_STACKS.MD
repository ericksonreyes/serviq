# Service Stacks

This document defines the default technology stacks for ServIQ services, grouped by domain family, plus the CQRS
read/write storage policy.

The canonical inventory of services lives in [SERVICE_MAP.md](../../../SERVICE_MAP.md).

## Stack Policy by Family

| Family               | Frontend              | Command backend                   | Read model API           | Write storage      |
|----------------------|-----------------------|-----------------------------------|--------------------------|--------------------|
| Platform             | ReactJS + Tailwind    | Laravel                           | none — real-time queries | PostgreSQL         |
| Service Operations   | ReactJS + Tailwind    | Laravel                           | none — real-time queries | PostgreSQL         |
| Customer Portal      | ReactJS + Material UI | Express + MongoDB (BFF / read API) | same service (BFF)       | MongoDB read model |
| Service Agent channel | ReactJS + Material UI (PWA) | Express (BFF)                | same service (BFF)       | none — proxied     |
| Finance & Accounting | ReactJS + Tailwind    | Laravel                           | none — real-time queries | PostgreSQL         |

Frontend policy: **React + Vite everywhere** — one framework/build stack for all channels. CSS is channel-appropriate:
**Material UI** for end-user channels (Customer Portal, Service Agent PWA — a11y defaults and mobile components),
**Tailwind** for internal admin UIs (Tenant Console, Platform Admin — dense custom layouts). Every view is post-auth and
API-driven, so SSR buys nothing; frontends run as `vite dev` hot-reload servers locally — static nginx builds are
a deployment artifact, not part of the local stack.

Library patterns (pinned with the first apps): `react-router-dom` for routing — `/login` public, every other
route behind a token guard; plain `fetch` wrapped in a small per-app `api.js` — no data-fetching framework.
The access token lives in React context memory only, so a page refresh returns to login until refresh-token
handling is specced. Auth calls hit IAM's public edge (`/api/v1/auth/*`) directly from every channel; channel
data calls follow the edge policy below. The Service Agent app adds `vite-plugin-pwa` for its installable,
offline-tolerant shell. Each app keeps a multi-stage Dockerfile (`node:22-alpine` build → `nginx:alpine`)
with an SPA-fallback `nginx.conf` (`try_files $uri $uri/ /index.html`) as the deployment build; the local
compose stack does not use it — frontends run as `node:22-alpine` `vite dev` containers on 8080–8083.

Channel policy: **one deployable frontend per user channel** — Customer Portal (React), Service Agent app (React
PWA), Tenant Console (React, serving admin/dispatch/support/ops views), Platform Admin (React).

Backend policy: **PHP/Laravel for all domain command APIs.** Python + FastAPI is reserved for AI-related services (the AI Agent and its parsing/inference tooling). The BFFs are plain Node ESM + Express (jose JWKS, amqplib, mongodb) — deliberately thin; revisit NestJS only if a BFF grows real logic.

Runtime policy: **keep containers simple.** Laravel services run as `php:<ver>-apache` (Apache + mod_php) containers — conventional, well-documented, and sufficient for the POC. BFFs run `node --watch src/index.js` on bind-mounted source (dev-mode stack). No worker-mode tuning (Octane/FrankenPHP, Swoole) — revisit only if the POC outgrows it.

## Command Model (Write Side)

- PostgreSQL is the default storage for all command/write models.
- Command services own business rules, validation, and state changes.
- Command services emit domain events after state changes so read models and other contexts can stay in sync.

## Event Sourcing

Business-logic-heavy contexts may store state as an event stream instead of a mutable row.

The distinction:

- **Event-driven** — state lives in a row; events are emitted as side effects. The row is the truth, events are
  notifications.
- **Event-sourced** — events are the truth. Current state is computed by folding the event stream; any stored row is
  just a projection.

Benefits:

- **Accurate state reconstruction** — the state of an entity is provably derived from everything that happened to it
- **Free audit trail** — history is the storage, not a bolt-on log
- **Temporal queries** — "what did this job look like last Tuesday" is a replay, not a guess
- **Natural fit** — job lifecycles and financial records are already sequences of events

Event-sourced services:

- **Service Job Management** — the job lifecycle and workflow instance are a sequence of events
  (`JobRequested → JobAssigned → StepStarted → StepCompleted → JobCompleted`)
- **Billing** — invoices, payment evidence, and adjustments need an immutable audit trail
- **Payouts** — payout lifecycle and fund distribution are money movement; append-only by nature

Services that stay CRUD:

- Service Management catalog, Workforce rosters, Identity & Access, Notification configuration, Customer Portal —
  these are low-complexity, state-shaped domains where event sourcing adds cost without benefit

Implementation requirements:

- **Event store** — an append-only PostgreSQL table per service; stored events are never edited or deleted
- **Snapshots** — aggregate state is snapshotted periodically (for example, every N events) so reconstitution does
  not replay the full stream on every request
- **Event schema versioning** — old events must replay forever. When an event's shape changes, version it and add an
  upcaster that migrates old payloads at read time; never rewrite stored events
- **Tooling** — Laravel services can use `spatie/laravel-event-sourcing`; the same package supports projectors,
  reactors, and snapshots

## Concurrency & Idempotency

Race conditions are expected in assignment, workflow, and payment flows. Services should handle them with these
mechanisms:

- **Optimistic concurrency on event streams** — event-sourced aggregates append with an expected version; a mismatch
  rejects the write instead of corrupting the stream
- **Conditional state transitions** — state changes use guarded updates such as `UPDATE ... WHERE status =
  'expected'`, so the first writer wins. This covers the broadcast-accept race (two agents accepting the same offer)
  and the double-assign race (manual and automatic assignment colliding)
- **Idempotency keys on command APIs** — mutating endpoints accept an idempotency key so retries and double-submits
  are safe; the payout port already models this with its external reference
- **Idempotent event consumers** — subscribers and projectors deduplicate by event identifier and tolerate
  out-of-order delivery, so replaying or redelivering events never corrupts read models
- **Workflow instance versioning** — step transitions and drag-drop reorders check the instance version, so an agent
  closing a step cannot collide with a dispatcher reordering open steps

## Read Model (Query Side)

The Customer Portal is the only read-heavy channel today: public browsing and tracking generate high query volume and
tolerate eventual consistency. Its backend serves reads from a MongoDB read model kept in sync with the command model by
an event listener or subscriber. Read documents are flat and denormalized so queries need no joins or aggregations at
request time.

Internal services (Platform, Service Operations, Finance & Accounting) query their PostgreSQL command models directly:

- Operational views (dispatch queue, job boards, agent status) need real-time accuracy.
- Financial views need current, authoritative numbers.
- Internal read volume does not justify maintaining separate read stores.
- A read model can still be added later for a specific context if a view becomes read-heavy.

## Testing Policy

- Service Operations backends are the reference example for TDD and BDD on business logic:
    - PHPSpec for unit tests (TDD)
    - Behat for acceptance criteria tests against PHP service classes (BDD)
- Other Laravel services should follow the same testing conventions.
- FastAPI services (the AI Agent and AI-related services) should use pytest for unit and integration tests.
- BFF read APIs should use Jest for unit tests.

### Testing dynamic workflows

Workflow templates are data, not code, so they are tested at two levels:

- **PHPSpec (engine)** — spec the workflow instance state machine once: `open → in-progress → closed` transitions,
  reorder locks on started/finished steps, completion on final step, cancellation from any step, and snapshot isolation
  from later template edits.
- **Behat (per-template behavior)** — use Scenario Outlines with Examples tables so one scenario walks each service
  type's pipeline:

```gherkin
Scenario Outline: agent advances through the service's steps
Given a service "<service>" with steps "<steps>"
And a job for that service assigned to an agent
When the agent closes each step in order
Then the job should be "Completed"

Examples:
| service           | steps                                                            |
| One Way Logistics | For Pick Up, Picked Up, In Transit, Delivered                    |
| Rider Delivery    | For Pick Up, Picked Up, In Transit, Delivered, Returning, Returned |
| Transport         | For Pick Up, Picked Up, In Transit, Arrived                      |
| Services          | Booked, Serviced                                                 |
| Food Delivery     | Preparing, Picked Up, On The Way, Delivered, Returning, Returned |
```

- A new service type is a new Examples row, not new test code.
- Include negative scenarios: cancelling mid-pipeline, reordering a locked step, skipping ahead.
- Templates themselves are testable data — validate them on save (non-empty, unique step names, terminal step exists).

## Backend for Frontend (BFF)

The Customer Portal backend is a BFF, not just a read API.

Why the BFF exists:

- **Single customer edge** — the Customer Portal BFF is the only backend the public customer frontend calls. It is
  not a global gateway: internal admin frontends call their own domain backends directly.
- **Aggregation** — customer views span contexts (requests, jobs, assignments, billing). The BFF composes one
  customer-shaped response instead of the browser calling many services.
- **Read model host** — the BFF serves read queries from its own MongoDB read model, so the read-heavy portal does not
  hit command services for queries.
- **Command proxy** — customer commands (book, cancel, update profile) are proxied to the owning Service Operations
  command APIs.
- **Customer-shaped contract** — the BFF translates internal domain language into customer-facing terms so frontend
  changes do not ripple into domain services.
- **Tenant resolution** — customer identity is resolved to tenant scope once at the BFF.

Internal admin frontends (Platform, Service Operations, Finance) call their own backends directly — no BFF. Those
backends are still internet-facing because tenant staff (Tenant Administrators, Dispatchers, Service Agents) reach
them from anywhere, so they enforce the same JWT validation, tenant scoping, and permission checks as the customer
edge. "Internal" describes the audience, not the network exposure. Only the service mesh itself (PostgreSQL,
RabbitMQ, Redis, Ollama, the vector store) has no public route.

## Notes

- All services validate JWTs per the [Security & Access Control](./security/README.MD) note; authorization uses signed
  role and permission claims.
- Laravel messaging conventions (first landed in Identity & Access): `php-amqplib` behind the messaging port —
  `php artisan outbox:publish` relays outbox rows to the `serviq.events` topic exchange and `php artisan
  events:consume` runs the per-service queue + DLQ subscriber. The service's `-consumer` container runs both
  loops; the API process never touches the broker.
- PHP packages use `composer` multi-stage builds (`composer:2` → `php:8.4-apache`); `php-amqplib` needs
  `ext-sockets`, Redis access uses the `redis` PECL extension.
- Identity & Access is the only JWT issuer; gateways and BFFs validate and forward tokens, they do not sign them.
- PostgreSQL extensions may be enabled per service where needed — for example PostGIS in Workforce Management for
  agent coordinates and service areas.
- Local development runs every dependency in Docker per
  the [Infrastructure & Local Development](./infrastructure/README.MD) policy.
