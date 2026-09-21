# Notification

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

### Delivery configuration

Delivery channels are configurable at three levels:

- **Tenant** — which channels the Service Provider has enabled at all (for example, in-app + email only, no SMS)
- **Event type** — routing rules per event (for example, `AssignmentCreated` → push + in-app; `JobCompleted` → in-app only)
- **User** — personal preferences and opt-outs per channel

Effective delivery requires all three: the tenant allows the channel, the event routes to it, and the user has not
opted out.

Each channel is an adapter behind a notification port, so a disabled channel simply means its adapter is not invoked:

```text
Domain Event
    │
    ▼
Notification backend
    │
    ├── resolve tenant channel config
    ├── resolve event routing rules
    ├── apply user preferences
    ▼
Channel adapters (only enabled ones fire)
    ├── In-App   (always available — writes to the feed)
    ├── Email    (adapter: SMTP / SES)
    ├── SMS      (adapter: Twilio / SNS)
    ├── Push     (adapter: FCM / APNs)
    └── Webhook  (adapter: tenant-configured endpoints)
```

### Message templates

Each event type ships with a **default template per channel** — subject/body for email, title/body for push, text for
SMS and in-app.

- Templates use placeholders such as `{{customer_name}}`, `{{job_reference}}`, `{{agent_name}}`, `{{tracking_link}}`
- Tenants can **override and edit templates** in the admin UI for wording, branding, or language
- Resolution order: tenant override → system default
- Templates are data stored in PostgreSQL, not code — editing a template never requires a deploy
