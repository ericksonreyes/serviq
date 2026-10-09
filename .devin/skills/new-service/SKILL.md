---
name: new-service
description: Scaffold a new ServIQ service — directory, env template, Dockerfile, compose entry, service map, in one change
argument-hint: "<service-name> e.g. serviq-billing-backend"
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
  - exec
---

Scaffold a service into the ServIQ monorepo. All steps land in ONE change — never partially.

## Checklist

1. **Confirm the service is in `SERVICE_MAP.md`** — the service name maps to a `services/serviq-*` directory. If the map lacks it, add the entry (`name`, `description`, `location`) first.
2. **Directory** — `services/<name>/` should already exist as a scaffold; if not, create it.
3. **`.env.example`** — copy the shape from a sibling of the same stack (any `*-backend` for Laravel, `*-bff` for NestJS, `*-frontend` for Vite, `ai-agent` for FastAPI). Hosts are compose service names — never `localhost` except frontend `VITE_*` values (browsers can't resolve compose DNS). Safe local defaults only.
4. **Dockerfile** — per stack: `php:<ver>-apache` (Laravel, mod_php), multi-stage `node:alpine` → `node dist` (BFFs), multi-stage vite build → `nginx:alpine` (frontends), `python:slim` (AI). Multi-stage always; `node_modules`/`vendor` never ship in the image or build context. Add a `.dockerignore` (`vendor`, `node_modules`, `dist`, `.git`, `.env`, build output).
5. **Compose** — uncomment the matching entry in `services/docker-compose.yml` (API + its `<name>-consumer` stub in the Event consumers section if the service subscribes to events). Entries already carry port, profile, `env_file`, `mem_limit`, and `develop.watch`. Verify with `docker compose -f services/docker-compose.yml config -q`.
6. **Verify** — `docker compose -f services/docker-compose.yml build <service>` then `up -d <service>`; check healthcheck/`docker compose ps`. Run `./scripts/install.sh` once to materialize the `.env`.

## Rules

- Match sibling conventions exactly — this is a 19-service family, consistency is the portfolio.
- Bounded-context ownership: a `*-backend` service implements exactly one context from `DOMAIN_BOUNDARIES.md`.
- No secrets in `.env.example`; no dev/watch servers in the default runtime.
