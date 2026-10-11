# serviq-platform-admin-frontend

Platform Admin — React + Vite + Tailwind (internal admin channel,
ADR-0017).

Pages: `/login` (platform-scope), `/` (tenant list via Platform
Management `/api/v1/tenants`).

Env (build-time `VITE_*`, localhost-mapped): `VITE_IDENTITY_API_URL`,
`VITE_PLATFORM_API_URL` — see `.env.example`. `npm run dev` for local
editing; container builds statically via multi-stage Dockerfile → nginx.
