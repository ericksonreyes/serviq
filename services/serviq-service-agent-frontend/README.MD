# Service Agent Frontend (:3001)

Field agent app — React + Vite + Material UI **PWA** (mobile/field
channel, ADR-0008/0017; `vite-plugin-pwa` ships the installable shell).
Talks to the Service Agent BFF (:8001) and IAM (:8010).

## What it's for

The agent's whole shift on a phone:

- **Home** — the aggregated shift view from the BFF's `/home` fan-out.
- **Jobs** — assigned work, the open pool for self-assign, accept/reject
  offers.
- **Execution** — job detail with check-in, step progression, and
  evidence capture (camera-first).
- **Cash turn-in** — end-of-shift hand-in, expected-vs-counted.

## Surface

| Route | Purpose |
| --- | --- |
| `/login`, `/signup` | Tenant-scope auth |
| `/` | Agent home (aggregated) |
| `/jobs`, `/jobs/{id}` | Queue + execution detail |
| `/turn-in` | Cash turn-in |

## Configuration

Build-time `VITE_*` env, localhost-mapped — see `.env.example`:

- `VITE_API_BASE_URL` → service-agent BFF (`:8001`)
- `VITE_IDENTITY_API_URL` → IAM (`:8010`)

## Ops

| Task | Command |
| --- | --- |
| Dev server | `docker compose -f services/docker-compose.yml up -d service-agent-dev` — vite hot reload on `:3001` |
| Production shape | Multi-stage Dockerfile → static build + PWA manifest → nginx |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **BFF pattern** | Real-time field state comes from the agent BFF (no read model upstream) — accept/claim/check-in proxy straight to the command APIs with the forwarded JWT. |
| **PWA** | Installable mobile shell for field use — the channel demands phone ergonomics (camera evidence, one-hand flows), which is why it's a separate app from the portals. |
| **Channel separation** | Field UX isolated from console/customer UX (SERVICE_MAP layout policy). |
