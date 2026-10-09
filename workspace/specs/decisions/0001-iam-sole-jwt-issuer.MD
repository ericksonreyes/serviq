# ADR-0001: IAM is the sole JWT issuer

- Status: Accepted
- Date: 2026-10-09

## Context

A multi-tenant microservice system needs one authoritative token format. Distributed issuance
(each service minting its own tokens) fragments revocation, key rotation, and audit.

## Decision

Identity & Access is the only service that issues JWTs, signed RS256 with `JWT_PRIVATE_KEY`.
All other services validate with `JWT_PUBLIC_KEY` only. `JWT_SECRET` exists solely as a
local/test fallback. Claims: `sub`, `tenant_id`, `roles`, `permissions`, `iss`, `aud`, `exp`,
`iat`, `jti`.

## Alternatives considered

- Shared `JWT_SECRET` (HS256) everywhere — simplest, but every service can mint tokens; a leak
  anywhere compromises issuance everywhere.
- Opaque tokens + introspection — adds a synchronous IAM dependency to every request.

## Consequences

- Asymmetric keys let any service verify without contacting IAM — zero auth round-trip.
- Revocation needs a shared check: the Redis `jwt:blacklist:<jti>` list (see ADR-0007).
- IAM becomes a critical-path service; its downtime prevents logins but not validation.

See: `technical/security/IDENTITY_AND_ACCESS.MD`, `JWT_SIGNING_KEYS.MD`, `JWT_INVALIDATION.MD`.
