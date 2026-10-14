# Notification Backend (:8019)

The pure consumer — binds `#` on `serviq.events` and turns domain events
into stored notifications. It proves the bus end-to-end: anything that
happens in the platform can surface as a notification without the
emitter knowing notifications exist.

## What it's for

Users shouldn't have to poll for state changes:

- **The notification feed** — every domain event becomes a stored,
  per-user notification the channels can list and mark read.
- **Channel routing** — effective channel = tenant config
  (`tenant_channels`) AND event routing (`event_routes`) AND user
  preferences (`user_preferences`). `in_app` is always on; email/sms/
  push/webhook only when the tenant enables them.
- **Templates** — data, not code: tenant override → system default,
  `{{placeholder}}` rendered from the event payload. Step names arrive
  as data, never as event types.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET …/tenants/{t}/notifications[?unread]` | Feed |
| `POST …/notifications/{n}/read`, `POST …/read-all` | Read markers |
| `GET/PUT …/notification-templates` | Template list/override (`notify.templates.manage`) |
| `PUT …/notification-channels` | Tenant channel switches |
| `GET /api/health` | Liveness |
| Consumes | `#` — the entire `serviq.events` topic → `notification.events` (DLQ: `.dlq`) |
| Emits | Outbox relay for its own state changes |

All `/api/v1/*` routes: `jwt.auth` + `tenant.scope`.

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-notification-backend` (phpspec + behat — **never** `phpunit`/`artisan test` inside the running container) |
| Event loops | `serviq-notification-consumer` runs `outbox:publish` + `events:consume` |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d notification-backend notification-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **Event-driven** | The `#` binding is the showcase — a new domain event type anywhere in the platform can notify without touching this service's code; `NotificationDispatcher` resolves routing per event/tenant/user. |
| **Hexagonal** | Delivery channels sit behind the notification port — `in_app` writes rows; external channels (email/sms/push/webhook) are adapters enabled per tenant, not hardcoded transports. |
| **DDD** | Notifications are this context's only state — event payloads are rendered via `TemplateRenderer` against tenant-overridable templates, so message wording is data owned here, not in emitters. |
| **SOLID** | SRP — `NotificationDispatcher` (channel resolution) vs `TemplateRenderer` (message composition) vs handlers (persistence). OCP — new channels/templates register as adapters/rows, no dispatcher rewrite. |
