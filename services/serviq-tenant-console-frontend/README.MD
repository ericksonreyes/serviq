# Tenant Console Frontend (:3002)

Internal console for tenant staff — React + Vite + Tailwind (ADR-0008/
0017). The one UI that legitimately spans contexts: dispatch, support,
and administration surfaces each call their owning service's API
directly with the user's JWT.

## What it's for

Tenant staff run the whole operation from here:

- **Dispatch** — queue & command, service requests, jobs, remittances
  (cash turn-in, deposit batch, payment evidence) including the AI photo
  count.
- **Support** — cases, customers, refunds & revenue.
- **Administration** — users & roles, service agents, catalog, service
  areas, business settings, revenue & payouts.
- **Notifications** — the in-app feed from `serviq.events`.

## Surface

| Area | Backed by |
| --- | --- |
| Dispatch views | Request `:8013`, Job `:8014`, Workforce `:8015`, Dispatch `:8016`, Field `:8017` |
| Support views | Customer Support `:8018` |
| Money views | Billing `:8020`, Payouts `:8021` |
| Catalog/areas/settings | Service Management `:8012` |
| Identity/notifications/AI | IAM `:8010`, Notification `:8019`, AI Agent `:8100` |

## Configuration

Build-time `VITE_*` env, localhost-mapped — one URL per domain service
plus `VITE_IDENTITY_API_URL` and `VITE_AI_AGENT_API_URL`; see
`.env.example` for the full list.

## Ops

| Task | Command |
| --- | --- |
| Dev server | `docker compose -f services/docker-compose.yml up -d tenant-console-dev` — vite hot reload on `:3002` |
| Build check | `docker exec serviq-tenant-console-dev npx vite build` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | The console mirrors the bounded-context map instead of hiding it — each page family calls its owning service (dispatch views → Job/Dispatch APIs, refunds → Support/Billing). Cross-context workflows are composed in pages, not smuggled into one API. |
| **Security** | Per-domain `VITE_*` URLs + one JWT — authorization is enforced per service by permission gates; the console only sees what the user's token allows. |
| **AI boundary made visible** | The cash turn-in page shows the AI count as a *suggestion for a human to check* (ADR-0003) — denominations render as a review sheet, submission stays a dispatcher action. |
