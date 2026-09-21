# Reconciliation

### Responsibility

**Match ServIQ's financial records against external payment, bank, and payout sources.**

This context covers ledger matching, settlement verification, discrepancy detection, chargeback tracking, and financial adjustments.

```text
Ledger Entry
Bank Statement
Gateway Transaction
Settlement Record
Adjustment
Discrepancy
Chargeback
Reversal
```

### Platform financial view

The Platform can see reconciliation-related aggregates such as:

- Reconciliation status
- Unmatched transactions
- Failed settlement batches
- Chargebacks and reversals
- Outstanding discrepancies
- Audit trail of financial adjustments

### Tenant financial view

A Service Provider can see its own reconciliation details, such as:

- Settlement confirmations
- Failed or disputed payments
- Adjusted payouts
- Reversal history
- Outstanding financial issues

### Example flow

```text
Internal Ledger Entry
        │
        ▼
External Payment Record
        │
        ▼
Matched?
   ┌────┴────┐
   │         │
  Yes       No
   │         │
   ▼         ▼
Reconciled  Exception
              │
              ▼
        Manual Review
```

### Scope boundaries

Reconciliation should not create invoices or calculate taxes itself. It should verify that the financial records from Billing, Payouts, and Taxation match the external world.
