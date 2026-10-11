---
name: event-messaging
description: ServIQ async integration conventions — RabbitMQ domain events, payload shape, identity propagation, outbox, idempotent consumers
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
---

Conventions for RabbitMQ domain events between bounded contexts. STATUS: foundational rules are decided; envelope/naming conventions below are the agreed shape — pin real examples in the specs when the first event is implemented, then tighten this skill.

## Decided invariants

- **Full spec: `workspace/specs/technical/infrastructure/EVENT_DELIVERY.MD`** — topic exchange `serviq.events`, per-service queues + DLQs, outbox schema, retry/idlepotency rules.
- **Consumers are dedicated containers** — each subscribing service runs a separate `<service>-consumer` compose service (same image + env, worker command). Never consume inside the API process.
- **Never put live JWTs in events.** Async work authenticates as a *service identity* carrying an on-behalf-of user ID (`INTERNAL_SERVICE_SECURITY.MD`). JWT propagation is sync-only.
- **Events are integration contracts.** Owned and named by the publishing context: `<Context>.<ThingVerb>` past tense — e.g. `Billing.InvoiceIssued`, `Dispatch.OfferBroadcast`, `Job.Completed`.
- **Crossing a context boundary = event or API call, never a shared table.** Events are the async path; RabbitMQ is the local adapter behind the messaging port (SNS/SQS is the documented managed swap).
- **Consumers are idempotent** — at-least-once delivery means handlers must tolerate replays (dedupe on event `id`, or upsert semantics).
- **Publishers use the outbox pattern** for event-sourced contexts (Job Management, Billing, Payouts) — write domain event + outbox row in one transaction, relay to RabbitMQ. No dual-write without it.

## Envelope shape (working contract)

```json
{
  "id": "<uuidv7>",
  "type": "Billing.InvoiceIssued",
  "occurred_at": "<iso8601>",
  "tenant_id": "<uuidv7>",
  "actor": { "service": "billing-backend", "on_behalf_of": "<user-uuid|null>" },
  "payload": { "...context-owned fields, ids not entities..." }
}
```

Payloads carry identifiers and facts, not hydrated entities. Consumers fetch detail via the publisher's API when needed.

## Wiring

- Connection via `RABBITMQ_URL`/`RABBITMQ_*` env vars (see any service `.env.example`): `amqp://serviq:serviq@rabbitmq:5672`.
- Laravel: queue/events through a RabbitMQ adapter package; Express BFFs: raw `amqplib` (current pattern); FastAPI: aio-pika. Pick per-stack conventions at implementation time and record them in `SERVICE_STACKS.MD`.
