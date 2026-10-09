# Event Delivery

How domain events move between bounded contexts. RabbitMQ is the local adapter behind the
messaging port; the conventions here are implementation-independent so a managed broker
(SNS/SQS) can replace it without touching publishers or consumers.

## Topology

- One topic exchange: **`serviq.events`** (durable).
- Routing key = event type: `<Context>.<ThingVerb>` past tense — e.g. `Job.JobCompleted`,
  `Billing.InvoiceIssued`, `Dispatch.OfferBroadcast`.
- Each consuming service owns one durable queue, `<service>.events`, bound with the event-type
  patterns it handles — e.g. `notification.events` binds `#` (all types, it templates on
  everything), `billing.events` binds `Job.*`, `Request.*`.
- Each service queue pairs with a dead-letter queue `<service>.events.dlq` via DLX
  (`x-dead-letter-exchange`); no requeue loops — failures dead-letter after retries.

## Envelope

Every event published to the exchange carries this envelope:

```json
{
  "id": "<uuidv7>",
  "type": "Job.JobCompleted",
  "occurred_at": "<iso8601>",
  "tenant_id": "<uuidv7>",
  "actor": { "service": "service-job-backend", "on_behalf_of": "<user-uuidv7|null>" },
  "payload": { "...context-owned fields — identifiers and facts, not hydrated entities..." }
}
```

- `id` — unique event identifier; consumers dedupe on it.
- `actor.service` — publishing service identity (async flows never carry live JWTs — see
  [INTERNAL_SERVICE_SECURITY](../security/INTERNAL_SERVICE_SECURITY.MD)).
- `actor.on_behalf_of` — IAM user UUID whose action triggered the flow, for audit.
- Payload carries ids/facts; consumers that need detail call the publisher's API.

## Publishing — outbox pattern

Publishers never write to the broker inside a request-response cycle.

1. The aggregate/command records the domain event and writes an `outbox` row **in the same
   transaction** as the state change (or, for event-sourced services, the same append):
   - `id` uuidv7, `type`, `payload` jsonb, `occurred_at`, `tenant_id`, `actor_service`,
     `on_behalf_of`, `published_at` (null until relayed).
2. A relay worker (`outbox:publish`) polls for `published_at IS NULL`, publishes to
   `serviq.events`, marks `published_at`. Poll interval ~1s locally.
3. Publish is at-least-once: a crash between publish and mark re-publishes — consumers must
   dedupe (below).

For event-sourced contexts (Service Job Management, Billing, Payouts), the outbox row is written
in the same transaction as the `stored_events` append.

## Consuming — dedicated containers

- Every service that subscribes runs its consumer as a **separate container** — its own
  compose service (e.g. `billing-consumer`) built from the same image and env file as the API,
  differing only in `command`:
  - Laravel: `php artisan queue:work rabbitmq --sleep=3 --tries=3`
  - NestJS: `node dist/consumer.js`
  - FastAPI: `python -m app.consumer`
- API and consumer never share a process — independent scaling, crash isolation, and `--wait`
  semantics stay clean. Scaling a subscriber = `docker compose up -d --scale billing-consumer=2`.
- Consumers are registered in `services/docker-compose.yml` alongside (and separately from)
  their API entries.

## Retry and dead-letter policy

1. Handler exception → NACK without requeue → broker retries via delayed redelivery
   (TTL + DLX back to the work queue), backoff ~5s / 30s / 2m.
2. After 3 failed attempts → dead-lettered to `<service>.events.dlq`; an alert/metric flags it.
3. DLQ messages are inspected manually (`rabbitmq` management UI on :15672) — replay by
   re-publishing to `serviq.events` after the root cause is fixed.

## Idempotency and ordering

- Consumers keep a `processed_events` table (`event_id` PK, `processed_at`); first step of every
  handler is `seen(event_id) → skip`. Duplicate deliveries are expected, not exceptional.
- Ordering is guaranteed **per aggregate stream only** (the outbox preserves insert order).
  Consumers must not assume global ordering across event types or aggregates.
- Event schema changes follow the versioning rule in [SERVICE_STACKS](../SERVICE_STACKS.MD):
  version the type (`Job.JobCompleted.v2`) or upcast at read time; never mutate published events.

## Healthchecks

Consumer containers have no port — their healthcheck is the worker process itself
(e.g. `php artisan queue:work` liveness via `queue:monitor` or a heartbeat file the loop
touches), so compose `--wait` still reflects real readiness.
