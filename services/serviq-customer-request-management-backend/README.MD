# Customer & Request Management Backend

Customers and service requests — the customer's **intent**. A request may
reference a catalog service and eventually produces a Service Job (conversion
is handed to Job Management via `Request.Converted`).

- Stack: Laravel (php:apache) + PostgreSQL (`serviq_requests`) + RabbitMQ
- Port: 8013

## API surface (JWT + `tenant.scope`)

| Route | Purpose |
| --- | --- |
| `GET/POST …/customers`, `GET …/customers/{id}` | Tenant customer records |
| `POST /api/v1/requests` | Submit a request → `Request.Submitted` |
| `GET /api/v1/tenants/{tid}/requests` | List (`?status=`) |
| `POST …/requests/{id}/convert` | → `Request.Converted` (Job Management consumes) |
| `POST …/requests/{id}/cancel` | → `Request.Cancelled` (not after conversion) |

## Events

`Customer.Created`, `Request.Submitted`, `Request.Converted`,
`Request.Cancelled` — outbox → `serviq.events` (`Request.Submitted` is the
first real domain event on the bus). `-consumer` runs `outbox:publish` only.

Tests: `vendor/bin/phpspec run`, `vendor/bin/behat`.
