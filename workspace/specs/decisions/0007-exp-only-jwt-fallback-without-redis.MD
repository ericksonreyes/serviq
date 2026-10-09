# ADR-0007: `exp`-only validation when Redis is absent or unreachable

- Status: Accepted
- Date: 2026-10-09

## Context

JWT revocation uses a shared Redis blacklist (`jwt:blacklist:<jti>`). If Redis isn't
configured or goes down, services must pick a posture: fail closed (reject everything) or fail
open (validate signature + `exp` only, dropping revocation checks).

## Decision

Fail open to `exp`-only validation whenever Redis is unconfigured or unreachable —
unconditional, for both "not configured" and "outage" cases — with the degradation observable
via logs/metrics. Specific high-sensitivity endpoints may still choose fail-closed.

## Alternatives considered

- Fail closed globally — a Redis blip takes down the entire platform; worse than the
  revocation window it prevents.
- Per-service opt-in — inconsistent posture across 12 services is worse than a documented
  uniform one.

## Consequences

- A revoked token remains valid until `exp` during Redis outages — a bounded, observable
  window (short TTLs shrink it).
- Availability is never hostage to the cache layer.

See: `technical/security/JWT_INVALIDATION.MD`; audit item R4.
