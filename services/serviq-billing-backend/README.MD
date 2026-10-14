# Billing Backend (:8020)

Finance command API — owns invoices, payment evidence, remittance
reconciliation, and refund *execution*. Event-sourced: `invoice_events`
is the source of truth; `invoices` is a rebuildable projection.

## What it's for

Money changes hands in three directions in field service: customers pay
invoices (e-wallet, bank, cash), agents hand in collected cash at shift
end, and support decisions turn into refunds. Billing is the system of
record for all of it:

- **Invoicing** — `Job.Completed` issues an invoice automatically;
  pricing currently follows the spec stub (flat PHP 1,500).
- **Payment evidence** — customers and dispatchers submit evidence
  (often AI-parsed); low-confidence or unmatched parses surface as
  review flags — the AI reports, Billing decides. Uploads arrive as
  `file`/`file_b64` and are persisted to MinIO (`serviq-evidence` bucket,
  tenant-scoped keys); `file_ref` stores the durable object reference.
- **Remittances** — turn-ins (cash hand-over or an external transfer —
  e-wallet, bank deposit, remittance center; ADR-0026/0027) tracked
  against expected totals; mismatches go to dispatcher
  confirmation, never silent acceptance. Payments carry a holder flag —
  agent-held funds owe a turn-in; company-held digital remits directly.
- **Refunds** — Customer Support *decides* (ADR-0004); Billing *executes*
  on `Support.RefundDecided`, from `paid` or `remitted` invoices.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/invoices`, `GET …/{invoice}` | Invoice read |
| `POST …/invoices/{invoice}/pay` | Record a payment → `Invoice.PaymentRecorded` |
| `GET/POST …/payment-evidence`, `POST …/{evidence}/review` | Evidence intake + manual review |
| `GET …/payment-evidence/{evidence}/file` | Stream the stored artifact (MinIO `serviq-evidence`) for verification |
| `GET/POST/DELETE …/company-accounts` | Tenant's receiving accounts per rail — transfer receipts' parsed recipient is checked against them (`recipient_mismatch` flag) |
| `GET …/remittances`, `GET …/remittances/expected` | Batches and per-agent expected totals |
| `POST …/remittances/turn-ins` | Agent turn-in — `channel=cash` (counted vs expected) or `wallet`/`bank`/`remittance_center` (transfer receipt → manual review) |
| `POST …/remittances/batches`, `/digital`, `/{r}/confirm` | Remittance batching + confirmation |
| `GET/POST …/refund-requests`, `POST …/{rr}/execute` | Refund request queue + execution |
| `GET /api/health` | Liveness |
| Consumes | `Job.*`, `Support.*` → `billing.events` (DLQ: `.dlq`) |
| Emits | `Invoice.*`, `Remittance.*` via transactional outbox → `serviq.events` |

All `/api/v1/*` routes: `jwt.auth` + `tenant.scope` middleware;
`billing.payments.record` / `billing.remit` permission gates on mutations.

## Event sourcing

`App\Domain\Billing\InvoiceStore::record()` appends to `invoice_events`,
folds the `invoices` projection, and writes the outbox row in **one
transaction** — same pattern as `JobStore` in Job Management. The
projection is a read convenience; replaying the stream rebuilds it.

## Tenant isolation — Postgres RLS

Billing is the RLS showcase slice (ADR-0028). Every tenant-bearing table
has `ENABLE` + `FORCE ROW LEVEL SECURITY` with a policy pinned to
`current_setting('app.tenant_id')` — a query that forgets its
`tenant_id` filter fails closed to zero rows instead of leaking another
tenant's ledger. `SetTenantContext` middleware `SET`s the GUC from the
verified JWT claim after `tenant.scope`; console paths (consumers,
`outbox:publish`, migrations) bypass via an explicit `app.is_system` GUC
set on command start in `AppServiceProvider`. Runtime connects as
`serviq_app`, a non-superuser role provisioned by
`services/postgres/init/01-app-roles.sql` — mandatory because Postgres
superusers bypass RLS unconditionally. Application scoping (`where`,
`abort_unless`, permission gates) stays first-class; RLS is the net,
not the mechanism — and it does not replace `lockForUpdate`, which still
guards intra-tenant settlement races.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-billing-backend` (phpspec + behat, sqlite — **never** `phpunit`/`artisan test` inside the running container; that wipes the dev DB) |
| Event loops | `serviq-billing-consumer` container runs `outbox:publish` + `events:consume` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d billing-backend billing-consumer` — env is baked at creation |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | Money decisions live only here — evidence validation/flags (`PaymentEvidenceController` + claimed-fields + recipient check against `company_accounts`), remittance variance (`App\Domain\Billing\RemittanceService`), refund execution. The AI agent submits; it never approves. Refund *decisions* are deliberately elsewhere (Support, ADR-0004). |
| **Event sourcing** | `invoice_events` append-only stream → folded `invoices` projection via `InvoiceStore`; `DomainEventRecorder` writes the outbox row in the same transaction. |
| **Event-driven** | `Job.Completed` → invoice issued; `Support.RefundDecided` → refund executed — zero synchronous calls into other services for those flows (`app/Events/Handlers/BillingEventHandler.php`, bindings in `EventsConsume`). |
| **Hexagonal** | Messaging behind `App\Services\Messaging\RabbitMq` (topic exchange + DLQ declaration); `DomainEventRecorder` is the outbox port every write path shares. |
| **SOLID** | SRP — `InvoiceStore` (persistence), `RemittanceService` (reconciliation), `BillingEventHandler` (inbound events). OCP — new event types register as handler cases, not rewrites of the consume loop. |
