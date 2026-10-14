# Platform Admin Frontend (:3003)

Console for ServIQ platform operators — React + Vite + Tailwind
(internal channel, ADR-0008/0017). Talks to Platform Management (:8011)
and IAM (:8010) with a platform-scope JWT.

## What it's for

The operator's view of the multi-tenant platform:

- **Tenant lifecycle** — list, detail, activate/suspend/deactivate
  through Platform Management.
- **Plans** — the subscription catalog tenants sit on.
- **Feature flags** — platform-wide switches.
- **IAM administration** — platform-scope users and roles.
- **Revenue** — platform-level income views.

## Surface

| Route | Purpose |
| --- | --- |
| `/login` | Platform-scope auth |
| `/` | Dashboard |
| `/tenants`, `/tenants/{id}` | Tenant lifecycle |
| `/plans`, `/feature-flags` | Catalog + switches |
| `/users`, `/income` | IAM admin + revenue |

## Configuration

Build-time `VITE_*` env, localhost-mapped — see `.env.example`:

- `VITE_IDENTITY_API_URL` → IAM (`:8010`)
- `VITE_PLATFORM_API_URL` → Platform Management (`:8011`)

## Ops

| Task | Command |
| --- | --- |
| Dev server | `docker compose -f services/docker-compose.yml up -d platform-admin-dev` — vite hot reload on `:3003` |
| Production shape | Multi-stage Dockerfile → static build → nginx |

## Architecture

| Discipline | How it shows up here |
| --- | --- |
| **Scope separation** | Platform admin ≠ tenant admin — this app carries only platform-scope views; tenant operations live in the tenant console. Two JWT scopes, two apps. |
| **DDD** | Tenant lifecycle transitions (activate/suspend/deactivate) are rendered off Platform Management's state machine — the UI shows actions, the domain decides legality (`409 illegal_transition` surfaces, not hidden). |
| **Channel separation** | Fourth deployable frontend in the per-channel layout (SERVICE_MAP policy) — operator tooling never ships in a tenant bundle. |
