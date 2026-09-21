# Customer Portal

### Responsibility

**Manage the customer-facing portal for a Service Provider's website or app.**

This boundary covers the parts of the portal that a customer directly sees and uses to interact with a Service Provider.

```text
Customer Account
Sign Up
Sign In
Browse Services
Book Service
Track Request
Receive Notifications
Leave Feedback
```

### Core concepts

```text
Customer
Account
Profile
Address Book
Service Catalog
Booking
Request Submission
Request Status
Notifications
Feedback
```

### Example flow

```text
Customer visits Service Provider website/app
        │
        ▼
Sign Up / Sign In
        │
        ▼
Browse Services
        │
        ▼
Select Service
        │
        ▼
Submit Request
        │
        ▼
Track Status
        │
        ▼
Complete / Review
```

### What this context owns

- Customer onboarding
- Customer account and profile management
- Service browsing and discovery
- Service request initiation
- Booking and schedule selection
- Customer-facing status tracking
- Notifications and self-service updates

### What this context does not own

- Service job dispatch
- Assignment strategy
- Field execution
- Internal finance and settlement logic

### Relationship to other contexts

Customer Portal can create or update a customer-facing request, but the operational handling of that request belongs to the service-operation contexts such as Customer & Request Management and Service Job Management.

### Backend for Frontend

The public Customer Portal frontend talks only to its own backend, which acts as a BFF. The BFF serves reads from its MongoDB read model and proxies commands to the owning Service Operations contexts. Internal services are not called directly by the public frontend.
