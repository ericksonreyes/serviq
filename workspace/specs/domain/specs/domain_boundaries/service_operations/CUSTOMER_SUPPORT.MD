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

### Implementation status

The dedicated Customer Support service (`serviq-customer-support-backend`) is implemented and owns complaint
intake plus refund decisions (`POST /cases`, `POST /cases/{case}/refund-decision`). The earlier interim
arrangement — Customer & Request Management absorbing complaint intake — is resolved; that context owns no
case or complaint surface.
