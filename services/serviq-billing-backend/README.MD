# Billing Backend (:8020)

Event-sourced invoices (`invoice_events` + folded `invoices`, same pattern
as serviq_jobs). `Job.Completed` → `Invoice.Issued` (flat PHP 1,500 spec
stub). `/pay` records payment evidence → `Invoice.PaymentRecorded`.
`/remittances` groups paid invoices into a settled batch.
`Support.RefundDecided` → `Invoice.Refunded` (executed here; decided in
Customer Support, ADR-0004). Refunds allowed from paid|remitted.
