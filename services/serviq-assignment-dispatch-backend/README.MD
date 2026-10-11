# Assignment & Dispatch Backend

Who should perform the Service Job — four strategies: dispatcher,
automatic (eligibility + scoring engine), broadcast (offers → first valid
accept), self-assignment. Workforce and Job arrive as projections; dispatch
never queries another service.

- Stack: Laravel (php:apache) + PostgreSQL (`serviq_dispatch`) + RabbitMQ
- Port: 8016

## Concurrency

- Broadcast/self-assign races resolve with a guarded `UPDATE … WHERE
  status='offered'` inside a transaction — exactly one winner; losers'
  offers flip to `revoked`. Partial unique index `assignments_one_accepted`
  is the backstop.
- `offers:expire` sweep converts stale offers → `expired`
  (`Assignment.OfferExpired`) — the tiered-timeout hook.
- Automatic with no eligible agents emits `Assignment.Unassigned` and leaves
  the job on the dispatcher queue (fallback chain in `assignment_rules`).

## Consumed / published

- Consumes `Job.*` (dispatchable_jobs) + `Workforce.*` (agents).
- `Job.ReadyForAssignment` triggers the configured strategy.
- Publishes `Assignment.Offered/Accepted/Rejected/Revoked/OfferExpired/
  Unassigned`. Service Job consumes `Assignment.Accepted` → `Job.Assigned`.
- `-consumer` runs `outbox:publish` + `offers:expire` + `events:consume`.

## API surface (JWT + `tenant.scope`)

`GET …/assignments[?status|job_id|agent_id]`, `GET …/dispatch/queue`,
`GET …/offers?agent_id=`, `PUT …/dispatch/rules`,
`POST …/dispatch/assign|broadcast|self-assign`,
`POST …/assignments/{id}/accept|reject`.

Tests: `vendor/bin/phpspec run`, `vendor/bin/behat`.
