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
3. **`.env.example`** — copy the shape from a sibling of the same stack (any `*-backend` for Laravel, `*-bff` for Express, `*-frontend` for Vite, `ai-agent` for FastAPI). Hosts are compose service names — never `localhost` except frontend `VITE_*` values (browsers can't resolve compose DNS). Safe local defaults only.
4. **Dockerfile** — per stack: `php:<ver>-apache` (Laravel, mod_php), multi-stage `node:alpine` → `node dist` (BFFs), `python:slim` (AI). Multi-stage always; `node_modules`/`vendor` never ship in the image or build context. Add a `.dockerignore` (`vendor`, `node_modules`, `dist`, `.git`, `.env`, build output). Frontends are the exception: locally they run as `node:22-alpine` `vite dev` containers — no Dockerfile needed for the stack; keep the multi-stage vite→nginx Dockerfile only as the deployment artifact.
5. **Compose** — uncomment the matching entry in `services/docker-compose.yml` (API + its `<name>-consumer` stub in the Event consumers section if the service subscribes to events; frontends add a `<name>-dev` service matching the existing `*-dev` blocks — `node:22-alpine`, `profiles: [dev, full]`, bind-mounted source, `npm-cache` volume). Entries already carry port, profile, `env_file`, and `mem_limit`. Hot reload: add the matching `volumes:` bind-mount line to the new service's entries in `docker-compose.yml` (API + consumer). Verify with `docker compose -f services/docker-compose.yml config -q`.
6. **Verify** — `docker compose -f services/docker-compose.yml build <service>` then `up -d <service>`; check healthcheck/`docker compose ps`. Run `./scripts/install.sh` once to materialize the `.env`.

## Rules

- Match sibling conventions exactly — this is a 19-service family, consistency is the portfolio.
- Bounded-context ownership: a `*-backend` service implements exactly one context from `DOMAIN_BOUNDARIES.md`.
- No secrets in `.env.example`; watch modes are the runtime — the whole local stack is dev-mode (bind-mounted source, hot reload everywhere).
