# Local Resource Budget

This document defines the memory and disk budget for running the full ServIQ stack locally in Docker on the
reference machine (MacBook Air M1, 8GB RAM). The POC target is **all services and infrastructure running
simultaneously** — the budget makes that possible, and the tiered profiles are the fallback when it isn't.

## Minimum Requirements (measured, 2026-10-11)

Numbers below are observed on the reference machine, not estimates — the planning tables follow.

### Docker Desktop VM allocation

| VM memory setting | Result |
| --- | --- |
| ~3.8 GiB | Stack runs, but the 1 GiB default swap stays 100% allocated at idle and `moondream` **fails to load** — llama-server is OOM-killed mid-load (`signal: killed`, HTTP 500 from `/api/v1/parse`). Stub mode required. |
| **5 GiB** | **Minimum for the full stack + live AI.** moondream loads (~1.3 GB resident), `/parse` round-trips in ~30s cold / seconds warm. Total VM usage ~3.8 GB, swap drops to ~500 MB. |
| 6–8 GiB | Comfortable headroom; do **not** allocate this on an 8 GB host — macOS starves. |

Rules of thumb for hosts with more RAM than the reference machine: the stack idles ~1.3–2.2 GB
(containers + VM overhead), each resident model adds ~1.3–3 GB (see model sizing below).

### Disk (fresh install)

| Item | Size | Notes |
| --- | --- | --- |
| Images (all services + infra) | ~12 GB | after `docker compose build` |
| Ollama model weights | ~3.7 GB | `moondream` 1.7 GB + `qwen2.5:3b` 1.9 GB, `serviq_ollama-models` volume |
| Data volumes (seeded) | ~0.2 GB | postgres dominates; mongo/minio/redis/rabbitmq negligible |
| Build cache | ~4 GB transient | reclaimable via `docker system prune` |
| **Working minimum** | **~20 GB free** | ~16 GB retained + transient build cache |

## Memory Budget

Allocations inside the Docker VM (~5–6GB usable after macOS and the VM's own overhead).
`mem_limit` is a ceiling, not a reservation — expected actual is the planning number; the cap
contract is the protection.

| Component | Count | Cap each | Expected each | Expected total | Notes |
|---|---|---|---|---|---|
| PostgreSQL (pgvector) | 1 | 256m | ~150MB | ~150MB | one instance, one DB per service; `shared_buffers=128MB` |
| MongoDB | 1 | 384m | ~300MB | ~300MB | `--wiredTigerCacheSizeGB 0.25` |
| Redis | 1 | 64m | ~15MB | ~15MB | JWT blacklist + pub/sub |
| RabbitMQ (+ mgmt UI) | 1 | 320m | ~250MB | ~250MB | `serviq.events` exchange + per-service queues/DLQs |
| MinIO | 1 | 256m | ~185MB | ~185MB | object storage port |
| Fluent Bit | 1 | 64m | ~30MB | ~30MB | logs → stdout; searchable sink optional (ADR-0014) |
| Ollama runtime | 1 | 4g | ~200MB | ~200MB | idle — weights excluded; see model spike below |
| Laravel API (CRUD contexts) | 9 | 128m | ~80MB | ~720MB | php:apache, mod_php, capped children, no Xdebug |
| Laravel API (event-sourced) | 3 | 128m | ~90MB | ~270MB | Job Mgmt, Billing, Payouts — stream replay cost |
| Event consumers (Laravel) | 12 | 128m | ~80MB | ~960MB | dedicated containers — `EVENT_DELIVERY.MD` |
| Event consumers (BFF + AI) | 2 | 128m | ~100MB | ~200MB | portal projector + AI async tasks |
| BFFs | 2 | 256m | ~125MB | ~250MB | `node --watch` on bind-mounted source |
| FastAPI AI Agent | 1 | 256m | ~150MB | ~150MB | |
| vite dev frontends | 4 | 256m | ~150MB | ~600MB | node:22-alpine, HMR, hot reload |
| | | | **Steady state** | **~4.3GB** | |
| Vision model loaded (spike) | | | | +1.7–3GB | moondream default; qwen2.5vl:3b if swapped |

Worst-case if every container sat at its cap: ~9GB — exceeds the machine, which is why the
caps exist (OOM-kill one container rather than starve the VM) and why the profiles are the
fallback lever. Ground truth: `docker stats`.

### Memory rules

- **No dev/watch servers in the always-on set.** `next dev`, `vite dev`, `ts-node --watch` each cost hundreds of MB.
  Build once, serve artifacts; run a dev server only for the service under active edit.
- **No JVM log sink in the always-on set.** Fluent Bit ships container logs to stdout (~30MB). A searchable sink
  (OpenSearch ~600MB capped, or Loki ~300MB) is an optional adapter behind the observability port — enable it
  only when a demo needs log search.
- **Models unload between calls.** `OLLAMA_KEEP_ALIVE=2m` so weights leave RAM when idle — the vision model is a
  spike, not a baseline.
- **Declare `mem_limit` per service in compose** — the budget is an enforceable contract, not a wish.
- **Healthchecks must not spawn heavy runtimes.** Compose runs healthcheck `test` execs *inside* the
  container — they share its `mem_limit` and CPU. Measured incident (2026-10-12): a `mongosh` probe every
  5s piled up ~30 JS-runtime processes inside `infra-mongo` (load 69, 89% system CPU, mongod starved,
  362% container CPU). Prefer native probes (`pg_isready`, `redis-cli ping`, `mc ready`, `curl`) or a
  `bash /dev/tcp` connect check.
- Consider **OrbStack or colima** over Docker Desktop on Apple Silicon — lower baseline VM overhead.

### Vision model sizing

`llama3.2-vision:11b` needs ~8GB alone — disqualified on the reference machine. Selected: **`moondream` (~1.7GB)**
as the default — adequate for clean receipt/document photos and leaves the most RAM headroom. Upgrade path if
e-wallet screenshot accuracy proves insufficient:

- `qwen2.5vl:3b` — ~3GB quantized, stronger on dense layouts/screenshots (fits the existing 4GB Ollama cap)
- `qwen2.5vl:7b` — ~4.7GB, `ai`-only profile only (needs the cap raised)
- Fallback: PaddleOCR → small text LLM (~2.5GB combined) if no vision model parses reliably within budget

See [Proof of Payment OCR/LLM Stack](./PROOF_OF_PAYMENT_OCR_LLM_STACK.MD) for the full candidate list.

## Disk Budget

Disk is the softer constraint but still worth conserving — model weights and base images dominate.

### Image selection

Prefer Alpine or slim tags only where an official variant exists and carries no compatibility risk:

| Image | Tag choice | Why |
| --- | --- | --- |
| Node (vite dev frontends) | `node:x-alpine` | dev servers, HMR only — no production work |
| Redis | `redis:alpine` | trivial swap |
| RabbitMQ | `rabbitmq:x-alpine` | official alpine variant exists |
| PostgreSQL | `postgres:x-alpine` | official variant; pgvector compiles cleanly on it |
| Node (BFF/vite runtime) | `node:x-alpine` | plain ESM, no native-dep issues expected |
| Python (AI Agent) | `python:x-slim` | **not alpine** — musl builds for native deps (PaddleOCR etc.) cost more pain than the disk saves |
| PHP (Laravel) | `php:x-apache` (Debian) | no official apache-alpine exists; fpm-alpine would mean FPM+nginx per service — complexity rejected |
| MongoDB, MinIO, Ollama | vendor images | no alpine/slim variants exist |

### The real disk consumers

1. **Ollama model weights** — each pulled model is 1–8GB. Rule: keep exactly one vision model and one text model
   pulled at a time; `ollama rm` anything unused; weights live in a named volume, never in an image.
2. **MongoDB / MinIO / vendor images** — ~500–800MB each; nothing to do but be aware.
3. **`node_modules` and `vendor/`** — these belong to build stages and named volumes, never baked into images and
   never copied via build context. Every service directory needs a `.dockerignore` (`node_modules`, `vendor`,
   `.git`, build output).
4. **Package caches** — Dockerfiles end install layers with cache cleanup: `apk add --no-cache`, `apt-get clean`,
   `composer clear-cache`, `npm cache clean --force`.
5. **Multi-stage builds** for anything compiled — build deps never ship in the final image.

### Housekeeping

- `docker system prune` habit between iterations; images accumulate fast during development.
- One [`services/docker-compose.yml`](../../../../services/docker-compose.yml) is the single source of the local stack — run `docker compose` from `services/` (or pass `-f services/docker-compose.yml` from the root). See tiers below.

## Tiered Profiles (fallback lever)

If the full stack still exceeds what the machine tolerates, compose profiles degrade gracefully rather than failing:

- `infra` — datastores, broker, cache, logging only
- `domain` — infra plus the Laravel services being worked on
- `ai` — infra plus Ollama and the AI Agent
- `full` — everything (the POC target)

## Related Documentation

- [Infrastructure & Local Development](./README.MD)
- [Proof of Payment OCR/LLM Stack](./PROOF_OF_PAYMENT_OCR_LLM_STACK.MD)
- [Service Stacks](../SERVICE_STACKS.MD) — runtime policy (mod_php, production Node builds, static frontends)
