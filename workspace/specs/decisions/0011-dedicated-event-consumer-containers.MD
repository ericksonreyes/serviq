# ADR-0011: Event consumers run as dedicated containers

- Status: Accepted
- Date: 2026-10-10

## Context

Every service that subscribes to RabbitMQ events needs a worker process. It could run in the
API container (supervisor), in a sidecar, or as its own compose service.

## Decision

Each subscriber runs a dedicated `<service>-consumer` container — same image and `.env` as
its API, differing only in `command` (`php artisan queue:work`, `node dist/consumer.js`,
`python -m app.consumer`). No ports; health is the worker loop.

## Alternatives considered

- In-process threads/supervisor inside the API container — violates one-process-per-container,
  muddies healthchecks, couples API restarts to worker restarts.
- Shared "consumer" container running all handlers — recreates a monolith inside the mesh;
  a crash in one handler poisons others; per-service scaling impossible.

## Consequences

- Independent scaling (`--scale billing-consumer=2`) and crash isolation.
- Cost: ~14 extra containers at ~55–80MB each (~800MB) — budgeted in
  `LOCAL_RESOURCE_BUDGET.MD`; the explicit price of honest microservice topology.
- Compose carries the stubs alongside API entries; both uncomment together.

See: `technical/infrastructure/EVENT_DELIVERY.MD`, `services/docker-compose.yml`.
