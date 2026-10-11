# Domain Events

Point-in-time inventory of the domain events ServIQ services publish and consume over the `serviq.events` topic exchange.

## What belongs here

- the catalog of event types, their emitters, payload keys, and consumers
- the shared envelope and naming conventions events follow

Delivery mechanics (outbox pattern, RabbitMQ topology, DLQs, idempotency, security rules) live in [Event Delivery](../../../technical/infrastructure/EVENT_DELIVERY.MD) — this folder inventories *what* exists, not *how* it works.

## Contract summary

Every event envelope carries:

```json
{
  "id": "<uuidv7>",
  "type": "<Context>.<ThingVerb>",
  "occurred_at": "<iso8601>",
  "tenant_id": "<uuidv7>",
  "actor": { "service": "<emitter>", "on_behalf_of": "<user-uuid|null>" },
  "payload": { }
}
```

- Events are named in past tense (`Job.Completed`, `Invoice.Issued`).
- The outbox row and the domain state change commit in one transaction; a relay publishes.
- Consumers are idempotent (`processed_events`); failures NACK to a per-queue DLQ.
- Payloads carry identifiers and facts — never live JWTs or full entity graphs.
- Nothing reaches `REMITTED`, `settled`, or equivalent terminal money states from an event alone — human confirmation is always a synchronous decision.

## Catalog

- [Event Catalog](EVENT_CATALOG.MD) — every emitted type grouped by publishing context, with payload keys and consumers, plus the consumer subscription map and known gaps.

## Conventions

Two prefix styles coexist today: entity-first (`Job.*`, `Invoice.*`, `Request.*`) and context-first (`Identity.*`, `Platform.*`, `Remittance.*`, `PaymentEvidence.*`, `Payout.*`, `Support.*`, `AI.*`). Both are documented in the catalog; if the codebase converges on one style, update this note and the affected emitters in the same change.

New event types: add the emit site, document it in the catalog, and update the consumer map in the same change.
