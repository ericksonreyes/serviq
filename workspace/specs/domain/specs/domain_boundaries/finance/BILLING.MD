# Billing

### Responsibility

**Generate and manage charges, invoices, and payment collection in ServIQ.**

This context covers subscription billing, service charges, invoice generation, payment capture, refunds, and failed payment handling.

```text
Invoice
Payment
Refund
Chargeback
Subscription Charge
Service Charge
Payment Status
```

### Platform financial view

The Platform can see billing-related aggregates such as:

- Subscription revenue
- Service charge revenue
- Invoice totals
- Payment success rate
- Failed payments
- Refund volume
- Revenue by tenant and billing period

### Tenant financial view

A Service Provider can see its own billing details, such as:

- Invoices
- Receipts
- Proof of payment uploads
- Outstanding balances
- Payment history
- Refund history
- Subscription charges
- Service charges

### Example flow

```text
Service Job Completed
        │
        ▼
Invoice Issued
        │
        ▼
Payment Captured
        │
        ├── Tenant balance updated
        ├── Platform fee recorded
        └── Billing status updated
```

### Proof of Payment Intake

A Service Agent or Tenant Administrator can upload a proof of payment when a payment is made outside the primary payment processor flow or when the platform needs evidence for manual verification.

ServIQ should accept image and PDF uploads, persist the original file, and create a structured payment evidence record.

Parsing is owned by the AI Agent service — Billing receives already-structured evidence through its API and never runs OCR or LLM inference itself:

```text
Service Agent / Tenant Administrator
        │
        ▼
Proof of Payment Upload
        │
        ▼
AI Agent — Vision LLM classification and field extraction
        │
        ▼
Billing API — Structured Payment Evidence
        │
        ├── Stored with confidence score
        ├── Flagged for manual review when confidence is low
        └── Downstream finance contexts consume the record
```

#### Stored data

- Original file reference
- Tenant and uploader identity
- Raw extracted text from the AI parse
- Extracted structured fields
- Confidence score
- Review status
- Audit trail

#### Extracted fields

- Payer name
- Amount and currency
- Payment date and time
- Reference or transaction number
- Payment channel or bank
- Optional notes from the proof document

#### Technical implementation reference

The Vision-LLM document parsing stack is documented in [Proof of Payment OCR/LLM Stack](../../../../technical/infrastructure/PROOF_OF_PAYMENT_OCR_LLM_STACK.MD); the polymorphic document types and extraction schemas live in [Proof of Payment Parsing](../../../../technical/ai/PROOF_OF_PAYMENT_PARSING.MD).

#### Validation rules

- The AI parse must return structured JSON that matches the payment evidence schema; Billing validates the payload before storing it.
- Low-confidence or incomplete parses are routed to manual review.
- The extracted data does not mark a payment as settled by itself.

#### Not included in this project

These capabilities are important in a mature financial platform, but they are intentionally out of scope for this project:

- Direct bank or payment-processor integrations for automatic proof verification
- Automatic settlement, reconciliation, or payment-status updates
- Tax calculation, payout execution, or fund distribution
- OCR or LLM model training and fine-tuning
- Fraud detection or document-forgery analysis
- Full approval workflow automation beyond manual review routing
- Advanced analytics or reporting on uploaded proof-of-payment records

### Scope boundaries

Billing should not decide how money is split between the platform and the tenant, or how taxes, payout execution, or fund distribution are handled. It should emit events that downstream finance contexts can consume.

Refund *cases* — eligibility review and approval — belong to Customer Support; Billing executes the approved refund payment.

The proof-of-payment intake flow should not decide final settlement or reconciliation outcomes. It should create a structured payment evidence record that Billing and downstream finance contexts can consume.

Remittance status transitions are human-confirmed, never automatic: Billing validates AI-parsed evidence (cash counts, receipts, bank deposit slips) and owns the status change to `REMITTED`, but only on a dispatcher's explicit confirmation — an AI extract alone settles nothing. See [Cash Remittance Counting](../../../../technical/ai/CASH_REMITTANCE.MD).
