# Customer Support

### Responsibility

**Manage customer inquiries, complaints, and issue resolution on behalf of a Service Provider.**

This boundary is used by the tenant's support team to handle follow-ups that happen outside the core booking and dispatch flow.

```text
Support Ticket
Case
Conversation
Escalation
Resolution
SLA
Internal Note
Customer Reply
```

### Core concepts

```text
Customer
Support Ticket
Case
Message Thread
Priority
Status
Escalation Level
Assigned Support Agent
Resolution
```

### Example flow

```text
Customer opens a support inquiry
        │
        ▼
Support Ticket Created
        │
        ▼
Support Agent Reviews
        │
        ├── Responds
        ├── Escalates
        └── Resolves
        │
        ▼
Customer Notified
```

### What this context owns

- Support tickets and cases
- Support agent assignment
- Inquiry history and conversation threads
- Internal notes
- Escalation and resolution tracking
- Customer follow-up status

### What this context does not own

- Customer self-service browsing and booking
- Service job dispatch or assignment strategy
- Field execution
- Billing, payouts, or settlement logic

### Relationship to other contexts

Customer Portal is the customer-facing portal where a customer can browse, book, and track services. Customer Support is the tenant-facing workflow used by the Service Provider to handle customer questions, complaints, and resolutions.
