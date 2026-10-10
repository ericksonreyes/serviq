# ADR-0020: Customer Support backend runs on plain Express+Node

- Status: Accepted — supersedes ADR-0019
- Date: 2026-10-10

## Context

ADR-0019 moved the support backend to NestJS to demonstrate a second stack at the domain
tier. In practice Nest's module/guard/pipe ceremony outweighs the service — Customer
Support is the thinnest context (cases, refund decisions, dedupe-only consumer), and its
read model is a single tenant-scoped query.

## Decision

`serviq-customer-support-backend` is implemented in plain Express + Node (TypeScript,
TypeORM, amqplib, mongodb) with CQRS split: Postgres remains the command/write store
(`POST /cases`, `POST …/refund-decision`), while the read model lives in MongoDB
(`serviq_support.cases`), projected by the consumer off `Support.*` events — the same
projection pattern as the portal BFF. `GET /tenants/:tenant/cases` never touches Postgres.
The outbox relay and events consumer are plain Node entrypoints in the same image.
All contracts unchanged:
verify-only RS256 JWT via JWKS (HS256 fallback), tenant-scope check, outbox →
`serviq.events`, `processed_events` dedupe, DLQ topology, `Support.CaseOpened` /
`Support.RefundDecided`.

## Alternatives considered

- Keep NestJS (ADR-0019) — heavier than this context needs; Express preserves every
  pattern with a fraction of the framework surface.
- Keep Laravel — still the default for the other 11 command backends per ADR-0009.

## Consequences

- The repo demonstrates TypeScript at the domain tier with minimal framework weight.
- MongoDB read model is eventually consistent — approved refund decisions appear on the
  read side after `Support.RefundDecided` is consumed (denied decisions update the
  command model only, matching the former Laravel behaviour)
- Schema is applied via idempotent `src/schema.sql` (mirrors the former Laravel migration
  1:1); TypeORM `synchronize` is off.
- SERVICE_STACKS.MD records this as the single intentional exception to ADR-0009.
- Contracts identical — Billing's `Support.RefundDecided` consumer is unaffected.

See: ADR-0004, ADR-0009, ADR-0011, ADR-0019 (superseded).
