# Customer Support

**Example:** Carla — Support Specialist at QuickFix

Carla handles **customer issues after a service request is in motion or completed**.

She can:

- Review and respond to complaints and support cases
- Follow up on service issues and escalate when needed
- Review refund requests and approve or reject them
- View invoices, payments, and expected-vs-remitted revenue for context

Carla decides **whether a refund is approved** — Billing executes the actual refund payment once approved.

```text
Customer
   │
   │ Complaint / Refund Request
   ▼
Customer Support
   │
   ├── Resolve / escalate the case
   └── Approve or reject the refund
            │
            ▼
        Billing executes an approved refund
```

She works inside one tenant: Carla sees QuickFix's cases and refunds, never another provider's.
