# Service Agent BFF (:8001)

Backend-for-frontend for the field agent PWA — aggregates the agent's
day across workforce, dispatch, and field-service, and proxies commands
with the caller's JWT forwarded. No read model by design: agents need
real-time state, so reads query the command APIs directly.

## What it's for

A field agent opens one screen and needs their whole shift:

- **Home** — `/agents/{id}/home` fans out to workforce + dispatch +
  field-service and stitches the agent's day into one response.
- **Work queue** — assigned jobs, the open pool for self-assignment,
  offer accept/reject.
- **Execution** — check-in, step start/close, evidence upload,
  completion.
- **Money** — cash collected markers, expected remittance totals,
  turn-ins, deposits, and invoice lookups per execution.
- **AI assist** — chat proxy for the agent-facing flows.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `GET /api/v1/agents/{id}/home` | Aggregated shift view |
| `GET …/me/jobs[/{id}]`, `GET …/me/open-jobs` | Assignments + open pool |
| `POST …/assignments/{id}/accept|reject`, `POST …/jobs/{id}/claim` | Offer answers + self-assign |
| `POST …/executions/{id}/check-in|complete|steps/{pos}/{action}` | Field actions |
| `GET/POST …/executions/{id}/evidence` | Evidence upload |
| `POST …/payment-evidence`, `GET …/executions/{id}/invoice`, `POST …/cash-collected` | Collection flow |
| `GET …/remittances/expected`, `POST …/turn-ins|deposits|wallet-turn-ins` | Cash + e-wallet turn-in (ADR-0026) |
| `GET /api/health` | Liveness |

Upstreams (env-configured): workforce, dispatch, field-service, job,
CRM, billing, ai-agent, platform-management. Feature flags are checked
against Platform Management before gated actions.

## Ops

| Task | Command |
| --- | --- |
| Dev | `docker compose -f services/docker-compose.yml up -d service-agent-bff` — `node --watch` on bind-mounted source |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d service-agent-bff` |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **BFF pattern** | `/home` is the aggregation seam — one UI call becomes a parallel fan-out with the caller's JWT forwarded verbatim; upstreams authorize per their own permissions, the BFF never escalates. |
| **Hexagonal** | Eight upstreams behind a `SERVICES` map of env-configured base URLs (`src/index.js`) — each domain API is a remote port the BFF adapts into agent-shaped responses. |
| **CQRS (deliberately absent)** | No read model — field state must be real-time (an accepted offer must not wait for a projector), so reads go straight to command APIs. The portal BFF shows the projection alternative. |
| **SOLID** | SRP — one `fetch`-wrapper + `AUTH(req)` helper shared by every proxy handler; aggregation logic per endpoint, auth per middleware. |
