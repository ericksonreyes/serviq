---
name: local-dev
description: ServIQ local Docker runbook — install, profiles, dev overlay/hot reload, memory-pressure fallbacks, troubleshooting
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

Runbook for the local stack. Reference machine: 8GB MacBook Air M1; steady-state budget ~2.5GB (`workspace/specs/technical/infrastructure/LOCAL_RESOURCE_BUDGET.MD`).

## Setup

```bash
./scripts/install.sh        # confirm → env copy → fresh-or-keep → staged build/up
```

Fresh start wipes the five data volumes only — `serviq_ollama-models` survives (model weights aren't business data; re-pulling is GBs of download).

## Profiles (`services/docker-compose.yml`)

```bash
cd services
docker compose --profile infra up -d    # datastores, broker, cache, fluent-bit
docker compose --profile domain up -d   # + Laravel APIs + BFFs
docker compose --profile ai up -d       # + ollama + ai-agent
docker compose --profile full up -d     # + frontends — the POC target
docker compose -f services/docker-compose.yml ...  # same, from repo root
```

## Live editing

Service dirs are bind-mounted in `services/docker-compose.yml` with framework watch modes: Laravel mounts serve PHP per request (no opcache), BFFs run `node --watch`, ai-agent runs `uvicorn --reload`, and `*-dev` services run `vite dev` on 8080–8083. `install.sh` installs each backend's host-side `vendor/` via a one-off `composer:2` container (runtime images ship no composer binary); Node services self-install `node_modules` on boot.

## Memory pressure — degradation order

1. Drop to `domain` profile (no Ollama/models — biggest lever).
2. Keep models unloaded (`OLLAMA_KEEP_ALIVE=2m` is already set; verify with `ollama ps`).
3. Swap vision model `qwen2.5vl:3b` → `moondream` (~1.7GB) in `ai-agent/.env`.
4. OrbStack/colima instead of Docker Desktop lowers VM baseline.

## Troubleshooting

- `docker compose ps` — healthcheck status; every infra service has one.
- `docker compose logs -f <svc>` — services emit structured JSON; fluent-bit tails containers to stdout.
- Ports: frontends 8080–8083 (vite dev), BFFs 3000–3001, Laravel APIs 8010–8021, AI 8100, postgres 5432, mongo 27017, redis 6379, rabbitmq 5672/15672, minio 9000/9001, ollama 11434.
- RabbitMQ creds are `serviq`/`serviq` (container-to-container); `guest` is localhost-only — a common silent failure.
