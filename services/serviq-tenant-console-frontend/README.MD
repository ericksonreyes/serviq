# serviq-tenant-console-frontend

Tenant Console — React + Vite + Tailwind (internal admin channel,
ADR-0017).

Pages: `/login` (tenant-scope), `/` (account/identity overview via IAM
`/api/v1/auth/me`).

Env (build-time `VITE_*`, localhost-mapped): `VITE_IDENTITY_API_URL` and
per-domain API URLs — see `.env.example`. `npm run dev` for local
editing; container builds statically via multi-stage Dockerfile → nginx.
