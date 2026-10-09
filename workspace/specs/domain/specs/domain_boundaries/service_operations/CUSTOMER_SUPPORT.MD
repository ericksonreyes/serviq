# Customer Support

### Responsibility

**How are customer cases, complaints, follow-ups, escalations, and refunds resolved?**

This context covers the tenant-facing support workflow: support cases filed by customers, follow-ups on service
issues, escalations, and the review and approval of refund requests.

```text
Support Case
Complaint
Follow-up
Escalation
Refund Case
Resolution
```

### What this context owns

- Support cases and complaints filed by customers
- Follow-ups and escalations on service issues
- Refund case review — eligibility, approval, and rejection decisions
- Case history and resolution records

### What this context does not own

- Refund payment execution — Billing executes the approved refund and records the money movement
- The underlying Service Request or Service Job — those stay in their own contexts
- Customer account and profile data — that stays in Customer & Request Management and IAM

### Interim ownership note

Customer Support was previously listed as a future bounded context; it is now a documented boundary. Until a
dedicated Customer Support service is implemented, complaint intake is handled by Customer & Request Management —
that interim ownership is intentional and temporary, not a permanent home.
