# Customer Support Backend (:8018)

Cases + refund decisions. ADR-0004: Support DECIDES refunds, Billing
EXECUTES them — `Support.RefundDecided` carries `invoice_id`,
`amount_cents` (null = full), reason, decided_by. Cases reference
job/invoice/customer ids; consumer keeps dedupe table warm for
`Job.*|Invoice.*|Request.*|Support.*`.
