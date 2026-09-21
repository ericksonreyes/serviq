# Payouts

### Responsibility

**Calculate and distribute the money owed to the platform, Service Providers, Service Agents, and other configured recipients after platform fees, refunds, and adjustments.**

This context covers payout calculation, fund distribution, payout scheduling, settlement batches, and payout status tracking.

```text
Payout
Settlement Batch
Net Payable
Platform Fee
Adjustment
Payment Method
Payout Status
```

### Platform financial view

The Platform can see payout-related aggregates such as:

- Payouts owed to tenants
- Pending payout amount
- Paid payout amount
- Failed payouts
- Settlement status
- Payout volume by tenant

### Tenant financial view

A Service Provider can see its own payout details, such as:

- Pending payouts
- Paid payouts
- Payout history
- Settlement dates
- Deducted platform fees
- Adjustments and reversals

### Fund distribution

ServIQ may split each payment into explicit recipient buckets so the net amount can be distributed in a deterministic and auditable way.

#### Minimal ruleset

- The split is calculated from the net payable amount after fees, refunds, taxes, and adjustments.
- The distribution buckets are limited to the configured recipients for this project:
  - Platform share
  - Service Provider share
  - Service Agent share
  - Other configured recipients
- Each bucket may be defined as a percentage or as a fixed amount, but the full distribution must always equal the net payable amount.
- Any rounding remainder must be assigned deterministically to a configured recipient, with the platform share as the default remainder recipient unless a different recipient is explicitly configured.
- The final distribution must be auditable as line items that record the recipient, amount, and calculation basis.

Default buckets may include:

- Platform share
- Service Provider share
- Service Agent share
- Other configured recipients

Each bucket should be recorded as a distribution line item, and the sum of the line items should match the net payable amount after fees, refunds, taxes, and adjustments.

### Example flow

```text
Payment Captured
        │
        ├── Platform fee deducted
        ├── Taxes accounted for
        └── Net amount calculated
        │
        ▼
Fund Distribution Calculated
        │
        ▼
Payout Scheduled
        │
        ▼
Payout Sent
        │
        ▼
Settlement Updated
```

#### Compact local sequence view

```text
Payment Captured
        │
        ▼
Fund Distribution Calculated
        │
        ▼
Payout Scheduled
        │
        ▼
Payout Execution via Gateway Port
        │
        ├── Fake local adapter in Docker for development
        └── Managed provider adapter in production
        │
        ▼
Optional webhook update or GetPayout polling
        │
        ▼
Settlement Updated
```

#### Technical implementation reference

The Hexagonal Architecture port contract and fake local payout gateway adapter are documented in [Payout Gateway Port](../../../../technical/infrastructure/PAYOUT_GATEWAY_PORT.MD).

### Scope boundaries

Payouts should not own invoice generation or bank reconciliation. It should focus on calculating and distributing the correct net amount across configured recipients and tracking the payout lifecycle.
