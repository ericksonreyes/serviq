# Architecture Decision Records

ADRs record the **why** behind ServIQ's architecture — the durable context that specs alone
don't carry. A spec says what is true; an ADR says why it became true and what was rejected.

## Format

```md
# ADR-NNNN: <Short Decision Title>

- Status: Accepted | Superseded by ADR-XXXX | Deprecated
- Date: YYYY-MM-DD

## Context
What forced this decision — constraints, tensions, goals.

## Decision
What we chose, in one or two sentences.

## Alternatives considered
What was rejected and why — one line each.

## Consequences
What this buys us and what it costs.
```

## Rules

- **Immutable once Accepted.** If a decision changes, write a new ADR that supersedes the old
  one — never rewrite history; the rejected-alternative reasoning is the valuable part.
- **One decision per file**, numbered sequentially `NNNN-kebab-case-title.MD`.
- **Link from the affected spec** — an ADR without inbound links is invisible. Conversely,
  specs may reference their ADRs for rationale.
- Keep them short — a page at most. Link to specs for detail.
- Update this index when adding an ADR.

## Index

- [ADR-0001](0001-iam-sole-jwt-issuer.MD) — IAM is the sole JWT issuer (RS256)
- [ADR-0002](0002-platform-management-owns-tenants.MD) — Platform Management owns the Tenant entity; IAM consumes `tenant_id` as scope
- [ADR-0003](0003-constrained-ai-boundary.MD) — AI is parser/advisor only; domain services own decisions
- [ADR-0004](0004-customer-support-bounded-context.MD) — Customer Support owns complaints and refund decisions
- [ADR-0005](0005-payouts-owns-remittance-shortfalls.MD) — Cash-remittance shortfalls are Payouts deductions
- [ADR-0006](0006-identifier-strategy.MD) — UUIDv7 entities, SQID-masked internal IDs, reference numbers are display-only
- [ADR-0007](0007-exp-only-jwt-fallback-without-redis.MD) — `exp`-only validation when Redis is absent or unreachable
- [ADR-0008](0008-single-react-vite-frontend-stack.MD) — React + Vite for all channels; NextJS dropped
- [ADR-0009](0009-laravel-apache-runtime.MD) — `php:apache` (mod_php) for Laravel services; no Lumen, Octane deferred
- [ADR-0010](0010-docker-first-local-poc.MD) — Docker-first full-stack local POC; profiles as memory fallback
- [ADR-0011](0011-dedicated-event-consumer-containers.MD) — Event consumers run as dedicated containers
- [ADR-0012](0012-model-selection-is-configuration.MD) — LLM choice is config, not architecture; `moondream` default
- [ADR-0013](0013-pgvector-vector-adapter.MD) — pgvector as the local vector-search adapter
- [ADR-0014](0014-minimal-local-observability.MD) — Fluent Bit → stdout locally; searchable sink is optional
- [ADR-0015](0015-alpine-images-where-safe.MD) — Alpine where official/safe; `php:apache` and `python:slim` stay Debian
- [ADR-0016](0016-compose-file-conventions.MD) — `services/docker-compose.yml` tracked; secrets stay in gitignored `.env`
- [ADR-0017](0017-channel-appropriate-css-frameworks.MD) — MUI on end-user channels, Tailwind on internal admin UIs
