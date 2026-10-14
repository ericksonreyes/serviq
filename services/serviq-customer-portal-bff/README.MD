# Customer Portal BFF (:8000)

Backend-for-frontend for the customer channel — a CQRS read model plus
command proxies shaped for the portal UI. Reads hit MongoDB projections
folded from domain events; writes proxy to the owning service with the
caller's JWT forwarded verbatim. Plain Express — deliberately thin.

## What it's for

The customer app needs one shaped API, not eleven domain APIs:

- **Browse** — catalog, locations, coverage checks, pricing, and
  availability in portal-sized responses.
- **My account** — profile and saved addresses (`/me/*` resolves the
  customer from the JWT rather than making the client carry ids).
- **My work** — submit/track/cancel requests, see jobs, leave feedback.
- **Notifications + AI chat** — the portal's bell icon and assistant
  both land here before fanning out.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET /api/v1/catalog[/{s}/availability|pricing]`, `GET …/operations` | Service browse |
| `GET /api/v1/locations/*`, `GET/POST …/coverage/*` | Geography + coverage |
| `GET/POST/PATCH …/me/profile`, `…/me/addresses` | Account |
| `GET/POST …/me/requests`, `…/{id}/cancel|feedback` | Intent lifecycle |
| `GET …/me/jobs[/{id}]` | Job tracking (MongoDB projection) |
| `GET …/me/notifications`, `POST …/{id}/read` | Feed |
| `POST /api/v1/chat` | AI agent proxy (customer profile) |
| `GET /api/health` | Liveness |
| Consumes | `Request.*`, `Job.*`, `Assignment.*` → `portal_requests`, `portal_jobs` (`src/projector.js`) |

Auth: verify-only JWT against IAM JWKS — the BFF never issues.

## Ops

| Task | Command |
| --- | --- |
| Dev | `docker compose -f services/docker-compose.yml up -d customer-portal-bff` — `node --watch` on bind-mounted source |
| Event loops | `serviq-customer-portal-bff-consumer` runs the projector (`src/consumer.js`) |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d customer-portal-bff customer-portal-bff-consumer` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **CQRS** | The read side is a MongoDB projection (`src/projector.js`) folded from `Request.*`/`Job.*`/`Assignment.*` — list/detail reads never touch a Postgres command model. Commands proxy to the owning context instead of sharing tables. |
| **Hexagonal** | Upstream services behind env-configured base URLs with one `fetch` helper + forwarded `Authorization` — the BFF is an adapter composition layer, not a domain. |
| **BFF pattern** | `/me/*` endpoints hide context boundaries (customer resolution, addresses, requests, jobs) behind one portal-shaped API — the UI's data model, not the domain's. |
| **Event-driven** | The read model is eventual-consistency by design — projector dedupe + DLQ keep it honest; a consumer restart replays from the queue, not a re-sync. |
