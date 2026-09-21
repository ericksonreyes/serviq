# Platform Management

### Responsibility

**Manage ServIQ itself.**

This is the platform-level domain sitting above individual tenants.

```text
Platform Management
│
├── Tenant
├── Subscription
├── Plan
├── Platform Configuration
├── Feature Flag
├── Platform Policy
└── Tenant Lifecycle
```

### Example

```text
ServIQ
 │
 ├── QuickFix Appliance Services
 │
 ├── FastDelivery Logistics
 │
 └── ABC Home Maintenance
```

Platform Management can:

- Create a tenant
- Activate a tenant
- Suspend a tenant
- Deactivate a tenant
- Manage subscription plans
- Enable platform features
- Configure platform-wide policies
- Review tenant income, platform fee income, and settlement status

It should **not** be responsible for:

```text
Assign John to Job #1025
Change a customer's address
Configure an appliance repair service
Record field-service photos
Maintain detailed ledger entries or payout accounting
```

Those belong to other contexts.

### Important distinction

```text
PLATFORM MANAGEMENT
"How is ServIQ operated?"

TENANT MANAGEMENT
"How is this business configured?"
```

Tenant Management is therefore treated as a **tenant-facing capability within Platform Management**, rather than necessarily being a separate bounded context.
