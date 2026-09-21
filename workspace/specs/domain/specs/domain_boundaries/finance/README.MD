# Finance & Accounting

This family groups the financial contexts for billing and payouts.

## Subcontexts

- [Billing](BILLING.MD)
- [Payouts](PAYOUTS.MD)

## End-to-end flow

```text
Proof of Payment Upload
        │
        ▼
Billing OCR / LLM intake
        │
        ▼
Structured Payment Evidence
        │
        ▼
Payouts fund distribution
        │
        ▼
Payout execution via gateway port
        │
        ├── Fake local adapter in Docker for development
        └── Managed provider adapter in production
        │
        ▼
Optional payout status webhook or GetPayout polling
        │
        ▼
Settlement Updated
```

## Scope

These contexts track money flow, financial records, settlement, and reporting across the platform and its tenants.
