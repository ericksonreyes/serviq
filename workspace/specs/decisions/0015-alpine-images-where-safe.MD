# ADR-0015: Alpine images where official and safe; `php:apache` and `python:slim` stay Debian

- Status: Accepted
- Date: 2026-10-10

## Context

Disk conservation is an explicit goal alongside RAM. Alpine images save disk but carry musl
libc risk; some official images simply don't ship Alpine variants.

## Decision

Alpine where it's a drop-in official tag: `nginx:alpine`, `redis:alpine`,
`rabbitmq:management-alpine`, `postgres:alpine`-lineage (pgvector image), `node:alpine`.
Two deliberate non-Alpine exceptions: **`php:apache`** (no official apache-alpine tag exists;
FPM+nginx per service is rejected complexity, ADR-0009) and **`python:slim`** for the AI Agent
(PaddleOCR's native deps against musl cost more pain than the disk saves). Vendor images
(MongoDB, MinIO, Ollama) ship what they ship.

## Alternatives considered

- Alpine everywhere — musl breakage on native deps is debugging time a POC doesn't need.
- Debian everywhere — forfeits free disk savings where compatibility risk is zero.

## Consequences

- Base-image disk saved where free (~hundreds of MB across nginx/redis/rabbitmq/postgres).
- The two exceptions are documented with their reasoning — a reviewer sees deliberate choice,
  not neglect.

See: `technical/infrastructure/LOCAL_RESOURCE_BUDGET.MD` (image policy table).
