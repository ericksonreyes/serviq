# Payouts Backend (:8021)

Agent-side money — owns the payout lifecycle and shortfall deductions.
Event-driven (transactional outbox), not event-sourced: `payouts` is a
normal table; domain events ride `serviq.events` like every other
context.

## What it's for

Agents do the work; Billing collects the money; someone has to decide
what the agent actually takes home:

- **Payout creation** — `Invoice.Issued` opens a payout for the job's
  agent (60% share, spec stub); `Assignment.Accepted` supplies the
  agent→job projection so no service is queried.
- **Shortfall recovery** — unpaid obligations (e.g. refunds, remittance
  shortfalls) deduct from the next payout through the `applied_cents`
  ledger — net may go negative (ADR-0005).
- **Settlement** — `/settle` runs the disbursement through a port; the
  stub adapter returns deterministic refs in local dev.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/payouts` | Payout list (with shortfall/applied/net breakdown) |
| `POST …/payouts/{payout}/settle` | Disburse via `DisbursementPort` → `Payout.Settled` |
| `GET /api/health` | Liveness |
| Consumes | `Assignment.*`, `Invoice.*`, `Support.*`, `Remittance.*` → `payouts.events` (DLQ: `.dlq`) |
| Emits | `Payout.*` via transactional outbox → `serviq.events` |

All `/api/v1/*` routes: `jwt.auth` + `tenant.scope`; settle is gated on
`billing.remit`.

## The shortfall ledger

`App\Domain\Payouts\PayoutPolicy` keeps recovery deterministic: when a
deductible event lands, unpaid `shortfall_cents` is rolled forward and
booked against `applied_cents` — the same settlement math the next payout
sees, so a deduction is applied exactly once.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-payouts-backend` (phpspec + behat, sqlite — **never** `phpunit`/`artisan test` inside the running container) |
| Event loops | `serviq-payouts-consumer` container runs `outbox:publish` + `events:consume` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d payouts-backend payouts-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | Payout math and recovery rules live only here (`PayoutPolicy`, the `applied_cents` ledger). Other services emit events; they never compute agent earnings. |
| **Hexagonal** | `App\Domain\Payouts\DisbursementPort` is a real port — `StubDisbursement` (`app/Infrastructure/`) is bound in `AppServiceProvider`, so a real payout gateway (bank/e-wallet) slots in via container binding, zero call-site changes. |
| **SOLID** | DIP — `PayoutController::settle` receives `DisbursementPort` by injection. SRP — `PayoutPolicy` (math) vs `PayoutEventHandler` (inbound events) vs controller (HTTP). |
| **Event-driven** | `Assignment.Accepted` → agent/job projection; `Invoice.Issued` → payout created; deduction events → shortfall ledger (`app/Events/Handlers/PayoutEventHandler.php`, bindings in `EventsConsume`). |
