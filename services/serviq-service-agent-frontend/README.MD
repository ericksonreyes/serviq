# serviq-service-agent-frontend

Service Agent — React + Vite + Material UI PWA (field/mobile channel,
ADR-0017). `vite-plugin-pwa` ships the installable shell.

Pages: `/login` (tenant-scope), `/` (agent home from the BFF).

Env (build-time `VITE_*`, localhost-mapped): `VITE_API_BASE_URL` → BFF
(:8001), `VITE_IDENTITY_API_URL` → IAM (:8010). `npm run dev` for local
editing; container builds statically via multi-stage Dockerfile → nginx.
