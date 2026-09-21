# Notification

Notification should eventually be its own bounded context.

### Responsibility

**How are users informed about events?**

```text
Email
SMS
Push Notification
In-App Notification
Webhook
```

For example:

```text
Assignment Created
       │
       ▼
 Notification
       │
   ┌───┼────┐
   ▼   ▼    ▼
 Push Email SMS
```

The Assignment domain should publish an event such as:

```text
AssignmentCreated
```

It should not need to know whether that event eventually results in:

```text
SMS
Email
Push
```

This keeps transport concerns outside the business domain.
