# Customer & Request Management Backend (:8013)

Command API for customers and service requests — the customer's
**intent**. A request may reference a catalog service and eventually
produces a Service Job; conversion is handed to Job Management via
`Request.Converted`.

## What it's for

Everything starts as a request, not a job. This service is the front
door for work:

- **Customer records** — the tenant's customer book: profiles and the
  saved addresses jobs get dispatched to.
- **Service requests** — "I need X done, preferably on date Y" — with
  status tracking, cancellation, and post-service feedback.
- **Conversion boundary** — staff approve intent into work via
  `/convert`; Job Management owns everything after that.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/customers`, `POST /api/v1/customers`, `GET/PATCH …/{customer}` | Customer records |
| `GET …/customers/by-user/{user}` | Resolve the caller's customer profile (BFF/AI use) |
| `GET/POST/PATCH/DELETE …/customers/{c}/addresses` | Saved addresses |
| `POST /api/v1/requests` | Submit → `Request.Submitted` |
| `GET …/tenants/{t}/requests[?status]`, `GET …/{request}` | Request tracking |
| `POST …/requests/{r}/cancel` | → `Request.Cancelled` (not after conversion) |
| `POST …/requests/{r}/feedback` | Post-service rating → `Request.FeedbackSubmitted` |
| `POST …/requests/{r}/convert` | → `Request.Converted` (`dispatch.assignments.manage`) |
| `GET /api/health` | Liveness |
| Emits | `Customer.*`, `Request.*` via transactional outbox → `serviq.events` |

All `/api/v1/*` routes: `jwt.auth` + `tenant.scope`; mutations gated on
`requests.manage` / `dispatch.assignments.manage`. This service
publishes only — the `-consumer` container runs `outbox:publish` alone.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-customer-request-management-backend` (phpspec + behat, sqlite — **never** `phpunit`/`artisan test` inside the running container) |
| Outbox relay | `serviq-customer-request-consumer` container runs `outbox:publish` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d customer-request-backend customer-request-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | Owns intent, not work — the `convert` boundary is explicit: Job Management consumes `Request.Converted` and takes it from there. Cancellation is only legal pre-conversion, a rule enforced here. |
| **Event-driven** | Every state change is a domain event through the transactional outbox (`Customer.Created`, `Request.Submitted/Converted/Cancelled/FeedbackSubmitted`) — `Request.Submitted` was the first real event on the bus and is what wakes Job Management. |
| **Hexagonal** | Outbox + RabbitMQ messaging isolated in `App\Services\Messaging` — controllers record events, never touch the broker. |
| **SOLID** | SRP — customers vs addresses vs requests as separate controllers; `DomainEventRecorder` is the single write-path for the bus. |
