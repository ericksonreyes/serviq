---
name: software-engineering
description: ServIQ engineering conventions — DDD bounded contexts, hexagonal ports/adapters, event sourcing, CQRS, testing disciplines, identifier policy
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
  - exec
---

You are implementing or reviewing ServIQ application code. Load these conventions before writing anything.

## Canonical sources (read first)

- `workspace/specs/technical/README.MD` — engineering disciplines and quality attributes
- `workspace/specs/domain/specs/DOMAIN_BOUNDARIES.md` — bounded-context map
- `SERVICE_MAP.md` — service inventory; every `services/` dir maps to one service
- `workspace/specs/technical/IDENTIFIERS.MD` — ID policy
- `workspace/specs/technical/SERVICE_STACKS.MD` — per-stack runtime policy

## Invariants

- **Bounded contexts own their state.** One Laravel backend per context; no shared tables between services, no cross-context DB reads. Integration happens via APIs (sync) or RabbitMQ domain events (async).
- **Ports and adapters everywhere.** External capabilities (messaging, persistence, object storage, payout, observability, vector search, real-time delivery) are ports — code to abstractions, never vendor SDKs in domain code.
- **Deterministic business rules live in services.** Business decisions (settlement, refunds, shortfall) belong to the owning bounded context — never in the AI agent, BFFs, or frontends.
- **Event sourcing** (spatie/laravel-event-sourcing) for Service Job Management, Billing, Payouts. Laravel only — Lumen is excluded partly because it can't run this package.
- **CQRS**: PostgreSQL command models; MongoDB read model only for the Customer Portal via its BFF.
- **Identifiers**: entities use UUIDv7; transactional records use internal bigint + SQID public masking; `JOB-1001`-style codes are display reference numbers, never API identifiers; `created_by`/`updated_by` store the IAM user UUID.
- **Testing**: business rules must be deterministic and unit-testable — PHPSpec/Behat for Laravel contexts, Jest for NestJS, pytest for the AI agent.

## Runtime policy

- Laravel = plain `php:apache` (mod_php). No Lumen, no Octane/FrankenPHP (deferred).
- NestJS = production `node dist` builds. Frontends = static Vite builds on nginx.
- No dev/watch servers in the always-on Docker set — `develop.watch` handles live editing.

## Before finishing

When adding/renaming a service: update `services/`, `SERVICE_MAP.md`, its commented entry in `services/docker-compose.yml`, and its `.env.example` in the same change. Run a link check if you touched docs.
