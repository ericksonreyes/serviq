---
name: frontend
description: ServIQ frontend conventions — React+Vite single stack, per-channel apps, dev-server env gotcha, vite dev hot reload
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
  - exec
---

Conventions for the four channel frontends. STATUS: all four apps are scaffolded (React + Vite; MUI on portal/agent, Tailwind on console/admin) with login wired against IAM. Sign-up: customers and agents self-register via `/signup` on their channels (IAM `auth/register`, self-serve roles only); service providers sign up as tenants via `/signup` on the Tenant Console (Platform Management `tenants/signup` → PENDING review). Library patterns are pinned in `SERVICE_STACKS.MD` — see "Library patterns" there.

## Decided

- **One framework**: React (latest) + Vite for ALL channels — Customer Portal, Service Agent (PWA), Tenant Console, Platform Admin. NextJS was dropped deliberately: every app is post-auth API-driven, SSR buys nothing.
- **CSS is channel-appropriate**: **Material UI** on end-user channels (Customer Portal, Service Agent — accessibility defaults, mobile/PWA components); **Tailwind** on internal admin UIs (Tenant Console, Platform Admin — dense custom layouts). Per ADR-0017.
- **Runtime**: `vite dev` hot-reload servers are the only local shape — the `*-dev` services in `docker-compose.yml` (profiles `dev` and `full`, ports 8080–8083), `node:22-alpine`, bind-mounted source, `node_modules` self-installed on boot. Static `vite build` → nginx is a deployment concern, not part of the local stack.
- **Env**: `VITE_*` vars are inlined at dev-server start — values must be `localhost` host-mapped ports (the browser can't resolve compose DNS). Per-service examples in each frontend's `.env.example`. Changing a VITE var requires restarting the dev container.
- **Auth**: JWT bearer from IAM login; store per channel conventions (access token in memory; refresh handling is an API-contract decision pending).
- **Ports**: 8080 customer-portal, 8081 service-agent, 8082 tenant-console, 8083 platform-admin.

## Channel notes

- Customer Portal & Service Agent talk ONLY to their BFF (3000/3001) — never directly to domain APIs.
- Tenant Console & Platform Admin call admin APIs directly (8010–8021) — they're browser-facing by design.
- Service Agent frontend is a PWA — field use implies offline tolerance and mobile-first layout.

## UX

Follow `workspace/specs/technical/user_experience/README.MD` — see the `ui-ux` skill for application rules.

## Docs visuals

User-facing flows get Playwright screenshot scripts (`scripts/screenshots/`); guides embed
the generated images — never hand-captured. See the `user-guide` skill (ADR-0018).
