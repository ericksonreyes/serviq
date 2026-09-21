# Tenant Administrator

**Example:** Mark — Operations Manager at QuickFix

Mark manages **QuickFix's ServIQ account**.

He can:

- Manage QuickFix users
- Add/remove Service Agents
- Create service types
- Configure pricing
- Configure service areas
- Manage business settings
- View reports
- Review revenue, invoices, refunds, and payout status
- Assign Dispatcher permissions

Importantly:

> Mark can manage **QuickFix**, but cannot manage another ServIQ tenant.

That's the multi-tenancy boundary.

```text
Platform
│
├── QuickFix ← Mark can manage this
│
├── ABC Cleaning ← Mark cannot access
│
└── XYZ Logistics ← Mark cannot access
```
