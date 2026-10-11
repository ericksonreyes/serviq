# serviq-customer-portal-frontend

Customer Portal — React + Vite + Material UI (end-user channel, ADR-0017).

Pages: `/login`, `/signup` (public customer self-registration →
IAM `/api/v1/auth/register`), `/` (requests & jobs from the BFF).

Env (build-time `VITE_*`, localhost-mapped): `VITE_API_BASE_URL` → BFF
(:8000), `VITE_IDENTITY_API_URL` → IAM (:8010). `npm run dev` for local
editing; container builds statically via multi-stage Dockerfile → nginx.
