# ADR-0019: Customer Support backend runs on NestJS

- Status: Superseded by ADR-0020
- Date: 2026-10-10

## Context

ADR-0009 standardised all command-model backends on Laravel/Apache for uniformity — one
skeleton, one set of conventions, cheap scaffolding. Customer Support is the thinnest
service (cases + refund decisions + a dedupe-only consumer), which makes it the cheapest
place to deliberately show a second stack at the domain tier without fragmenting the
platform's plumbing conventions.

## Decision

`serviq-customer-support-backend` is implemented in NestJS (TypeScript, Express, TypeORM,
amqplib). All platform patterns are preserved unchanged: verify-only RS256 JWT via IAM JWKS
(HS256 `JWT_SECRET` local fallback), role middleware, outbox → `serviq.events` topic
exchange with a `-consumer` relay container, `processed_events` dedupe, DLQ topology, and
the same API/event contracts (`Support.CaseOpened`, `Support.RefundDecided`).

## Alternatives considered

- Keep Laravel — rejected here only to demonstrate stack breadth; every other command
  backend stays Laravel per ADR-0009.
- Rewrite all backends to Nest — rejected: the Laravel uniformity is what made 11 services
  cheap to scaffold and review.

## Consequences

- The repo now demonstrates TypeScript/NestJS at the bounded-context tier, not only in BFFs.
- SERVICE_STACKS.MD records this as the single intentional exception to ADR-0009; new
  backends still default to Laravel.
- Contracts are identical — Billing's `Support.RefundDecided` consumer requires no change.

See: `technical/README.MD`, ADR-0004 (support bounded context), ADR-0009, ADR-0011.
