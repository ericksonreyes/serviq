# Taxation

### Responsibility

**Calculate, record, and report taxes associated with ServIQ transactions.**

This context covers tax rates, tax rules, tax breakdowns, tax remittance, and jurisdiction-specific tax handling.

```text
Tax Rate
Tax Record
Taxable Amount
Withholding Tax
VAT
GST
Tax Remittance
```

### Platform financial view

The Platform can see taxation-related aggregates such as:

- Taxes collected across tenants
- Taxes remitted
- Tax liabilities by tenant
- Jurisdiction-based tax summaries
- Tax adjustments and exceptions

### Tenant financial view

A Service Provider can see its own tax details, such as:

- Tax breakdown on invoices
- Taxes collected from customers
- Taxes withheld from payouts
- Tax remittance status
- Monthly or quarterly tax summaries

### Example flow

```text
Invoice or Payment Event
        │
        ▼
Tax Rules Evaluated
        │
        ├── Taxable amount computed
        ├── Tax record created
        └── Remittance tracked
```

### Scope boundaries

Taxation should not own billing or payout execution. It should provide the tax amounts and records needed by Billing, Payouts, and Reconciliation.
