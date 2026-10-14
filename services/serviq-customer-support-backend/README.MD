# Customer Support Backend (:8018)

Cases and refund decisions — Express + TypeScript (ADR-0019/0020).
Command side on PostgreSQL (`serviq_support`); read model on MongoDB,
projected by the consumer off `Support.*` events. Support **decides**
refunds; Billing **executes** them (ADR-0004).

## What it's for

When a job goes wrong, this is where it lands:

- **Cases** — complaints and escalations with notes and a status
  lifecycle (`open → in_progress → escalated → resolved`).
- **Refund decisions** — the support agent's call: approve/deny, amount,
  reason — emitted as `Support.RefundDecided` for Billing to execute.
- **Fast reads** — the console's case list hits the MongoDB projection,
  never Postgres.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/cases[?status]`, `GET …/{case}` | Case read (MongoDB projection) |
| `POST /api/v1/cases` | Open a case → `Support.CaseOpened` |
| `POST …/cases/{c}/notes` | → `Support.CaseNoted` |
| `POST …/cases/{c}/status` | → `Support.CaseStatusChanged` |
| `GET …/refund-decisions`, `POST …/cases/{c}/refund-decision` | → `Support.RefundDecided` |
| `GET /api/health` | Liveness |
| Consumes | `Support.*` → MongoDB read model (DLQ + `processed_events` dedupe) |
| Emits | `Support.*` via transactional outbox → `serviq.events` |

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-customer-support-backend` (node:test) |
| Processes | API: `node --watch` on source (dev); consumer container: `node dist/consumer.js` — outbox relay + event consumer |
| Schema | `src/schema.sql` — applied idempotently at boot |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | The decide/execute split is the boundary made literal — `Support.RefundDecided` carries `invoice_id`, `amount_cents` (null = full), reason, `decided_by`; Billing owns the money mechanics (ADR-0004). |
| **CQRS** | `src/readmodel.ts` — writes hit Postgres tables; the consumer folds `Support.*` into `serviq_support.cases` in MongoDB. `GET …/cases` reads only the projection — same read-model pattern as the portal BFF. |
| **Event-driven** | `src/events.ts` — DLQ topology per EVENT_DELIVERY.MD, `processed_events` dedupe, self-projection off its own events. `src/outbox.ts` relays emits transactionally. |
| **SOLID** | SRP — `app.ts` (HTTP) vs `consumer.ts` (process entry) vs `events.ts` (handling/projection) vs `outbox.ts` (publish path) vs `schema.sql` (storage). |
