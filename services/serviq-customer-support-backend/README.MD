# Customer Support Backend (:8018)

Cases + refund decisions — plain Express/Node + TypeScript (ADR-0020).

- **Command side:** PostgreSQL (`serviq_support`) — cases, refund_decisions,
  outbox. ADR-0004: Support DECIDES refunds, Billing EXECUTES them —
  `Support.RefundDecided` carries `invoice_id`, `amount_cents` (null = full),
  reason, decided_by.
- **Read model:** MongoDB (`serviq_support.cases`), projected by the
  `-consumer` container off `Support.*` events (same pattern as the portal
  BFF). `GET /tenants/:tenant/cases` never touches Postgres.
- **Entrypoints:** `node dist/main.js` (API), `node dist/consumer.js`
  (outbox relay + events consumer, DLQ + dedupe).
- Schema: `src/schema.sql`, applied idempotently at boot.
