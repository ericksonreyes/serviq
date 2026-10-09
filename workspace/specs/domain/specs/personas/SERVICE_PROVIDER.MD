# Service Provider (tenant)

**Example:** QuickFix Appliance Services

QuickFix is a tenant on ServIQ.

It offers:

- Refrigerator repair
- Washing machine repair
- Air-conditioner maintenance
- Appliance installation

The Service Provider is the **business entity**, not an individual user.

```text
ServIQ
  │
  └── QuickFix Appliance Services
          │
          ├── Customers
          ├── Service Agents
          ├── Services
          └── Service Jobs
```

## Onboarding
To be a service provider, he can sign up and create a new service provider (tenant) account.

## Service provider roles:
- Customer Support
  - Can manage customers and their concerns
  - Can view invoices and payments
  - Can process refunds
  - Can view expected vs remitted revenue
- Dispatcher
  - Can manage service jobs and assign them to service agents
  - Can view service job status
  - Can manage service agents
  - Can manage service agent schedules
  - Can manage service agent accounts
- Service Agent
  - Can manage their own service jobs