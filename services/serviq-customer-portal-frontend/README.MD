# Customer Portal Frontend (:3000)

Customer-facing app — React + Vite + Material UI (end-user channel,
ADR-0008/0017). Talks to its BFF (:8000) for work data and IAM (:8010)
for auth; it never calls a domain service directly.

## What it's for

The public face of ServIQ for end customers:

- **Self-service onboarding** — public signup → IAM registration, then
  login.
- **Browse & book** — the tenant's service catalog, coverage checks,
  availability, booking into a service request.
- **Track** — request/job status, notifications, and the customer
  profile + saved addresses.
- **AI assistant** — chat with the `customer` profile via the BFF.

## Surface

| Route | Purpose |
| --- | --- |
| `/login`, `/signup` | Public auth (signup → IAM `auth/register`) |
| `/` | Requests & jobs home |
| `/catalog`, `/book` | Service browse → booking |
| `/requests/{id}` | Request detail |
| `/profile`, `/notifications` | Account + feed |

## Configuration

Build-time `VITE_*` env, localhost-mapped (browsers can't resolve
compose DNS) — see `.env.example`:

- `VITE_API_BASE_URL` → customer-portal BFF (`:8000`)
- `VITE_IDENTITY_API_URL` → IAM (`:8010`)
- `VITE_PLATFORM_API_URL` → Platform Management (`:8011`)

## Ops

| Task | Command |
| --- | --- |
| Dev server | `docker compose -f services/docker-compose.yml up -d customer-portal-dev` — vite hot reload on `:3000` |
| Production shape | Multi-stage Dockerfile → static build → nginx |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **BFF pattern** | All domain traffic goes through the portal BFF — the UI never maps domain boundaries itself; `/me/*` endpoints shape data for these pages. |
| **Channel separation** | One deployable frontend per user channel (SERVICE_MAP layout policy) — customer pages can't accumulate staff concerns because they're a different app entirely. |
| **Security** | Bearer-token auth against IAM directly for login; everything else rides the BFF's forwarded JWT — no stored service credentials in the bundle. |
