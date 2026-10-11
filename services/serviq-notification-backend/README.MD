# Notification Backend

The pure consumer — binds `#` on `serviq.events` and turns domain events
into stored notifications. Proves the bus end-to-end.

- Stack: Laravel (php:apache) + PostgreSQL (`serviq_notifications`) + RabbitMQ
- Port: 8019

## Delivery model

Effective channel = tenant config (`tenant_channels`) AND event routing
(`event_routes`) AND user preferences (`user_preferences`). `in_app` is
always available; other channels (email/sms/push/webhook) fire only when the
tenant enables them — adapters behind the notification port.

## Templates

Data, not code (`notification_templates`): tenant override → system default.
`{{placeholder}}` renders from the event payload — step names arrive as data
(`{{step_name}}`), never as event types. Seeded defaults for `Job.*`,
`Request.*`, `Assignment.*`, `Billing.*`.

## API surface (JWT + `tenant.scope`)

- `GET …/notifications[?unread]`, `POST …/notifications/{id}/read` — feed
- `GET/PUT …/notification-templates` — list/override
- `PUT …/notification-channels` — tenant channel switches

The `-consumer` container runs `outbox:publish` + `events:consume`.

Tests: `vendor/bin/phpspec run`, `vendor/bin/behat`.
