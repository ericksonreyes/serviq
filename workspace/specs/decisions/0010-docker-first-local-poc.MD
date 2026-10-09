# ADR-0010: Docker-first local POC — all services runnable simultaneously

- Status: Accepted
- Date: 2026-10-09

## Context

ServIQ is a portfolio proof-of-concept on an 8GB MacBook Air M1. The question was whether
"microservices" could survive on that hardware — and whether production deployment concerns
should shape the design now.

## Decision

Production deployment is a declared non-goal. The POC target is the **entire stack running
simultaneously in Docker** via `services/docker-compose.yml` with profiles
(`infra`/`domain`/`ai`/`full`). Ports and adapters preserve the managed-swap story without
implementing it. Tiered profiles are the memory-pressure fallback, not the default.

## Alternatives considered

- Design for Kubernetes/production now — premature; doubles config surface for a demo that
  never leaves the laptop.
- "Representative subset" running locally — weaker proof; the point is that the real system
  fits.

## Consequences

- Every infrastructure choice is judged against the ~2.5–3.3GB steady-state budget
  (`LOCAL_RESOURCE_BUDGET.MD`): production builds, `mem_limit` caps, no dev servers, minimal
  observability (ADR-0014), bounded model sizes (ADR-0012).
- The portfolio claim is verifiable: `docker compose --profile full up -d` either works or
  it doesn't.

See: `PROJECT_PURPOSE.MD`, `technical/infrastructure/LOCAL_RESOURCE_BUDGET.MD`,
`services/docker-compose.yml`.
