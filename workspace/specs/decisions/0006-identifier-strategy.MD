# ADR-0006: UUIDv7 entities, SQID-masked internal IDs, reference numbers are display-only

- Status: Accepted
- Date: 2026-10-09

## Context

The system needs identifiers that are: unguessable externally, sortable/index-friendly
internally, and human-readable where staff quote them (e.g. "Job JOB-1042").

## Decision

- User and tenant entity IDs: **UUIDv7** (time-ordered, index-friendly).
- Transactional records: internal sequential **bigint**, exposed publicly **SQID-masked**.
- `JOB-1042`-style codes: **display reference numbers** — generated per tenant, never API
  identifiers, never used for authorization lookups.
- `created_by`/`updated_by` store the IAM user UUID (`sub` claim).

## Alternatives considered

- Sequential IDs everywhere — enumerable, leaks volume, violates the no-predictable-ID rule.
- UUIDv4 — random ordering fragments B-tree indexes; v7 preserves insert-locality.
- Reference numbers as identifiers — tenant-scoped display codes aren't unique/stable keys.

## Consequences

- API surface is unguessable; internal joins stay fast on bigint.
- Reference numbers remain a UX nicety with zero security role.

See: `technical/IDENTIFIERS.MD`, `GLOSSARY.MD`.
