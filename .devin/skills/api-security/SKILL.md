---
name: api-security
description: ServIQ security model — JWT RS256 issuance/validation, blacklist policy, public edge vs service mesh, env var conventions
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - write
---

Security invariants for any endpoint, auth flow, or service-to-service call in ServIQ.

## Canonical sources

- `workspace/specs/technical/security/IDENTITY_AND_ACCESS.MD` — IAM ownership and token model
- `workspace/specs/technical/security/JWT_INVALIDATION.MD` — blacklist + fallback posture
- `workspace/specs/technical/security/INTERNAL_SERVICE_SECURITY.MD` — exposure model
- `workspace/specs/technical/security/JWT_SIGNING_KEYS.MD` — key handling

## Invariants

- **IAM is the sole JWT issuer.** RS256; IAM holds `JWT_PRIVATE_KEY`, every other service gets `JWT_PUBLIC_KEY` only. `JWT_SECRET` exists solely as a local/test fallback — never wire it into service-to-service auth.
- **Claims**: `sub` (IAM user UUIDv7), `tenant_id`, `roles`, `permissions`, `iss`, `aud`, `exp`, `iat`, `jti`.
- **Revocation**: shared Redis blacklist keyed `jwt:blacklist:<jti>`. If Redis is unconfigured or unreachable → `exp`-only validation (documented standing posture, R4 — observable, not silent).
- **Exposure model**: browser-facing APIs (BFFs, admin APIs, IAM login) are public + fully JWT-enforced. The service mesh (datastores, RabbitMQ, MinIO, Ollama) has no public route — bridge network only.
- **Sync calls** propagate the caller's JWT end-to-end. **Async flows** authenticate as a service identity carrying an on-behalf-of user ID — never put live JWTs in events.
- `created_by`/`updated_by` columns store `sub`, not display names.

## Environment contract

Every service's `.env.example` already carries the right vars (`JWT_PUBLIC_KEY`, `JWT_ISSUER=serviq-iam`, `JWT_AUDIENCE=serviq`; IAM additionally has `JWT_PRIVATE_KEY`, `JWT_ALGORITHM=RS256`, `JWT_TTL`). Don't invent parallel auth env vars — extend the canonical set.

## When writing endpoints

Default deny: new endpoints are JWT-protected unless explicitly public (login, health). Validate `tenant_id` scoping on every tenant-owned resource — a valid token from tenant A must not read tenant B's data.

Public read-only directory-style endpoints do exist for cross-portal lookups (precedent: `GET /v1/providers`, `GET /v1/feature-flags/{key}` on platform-management): unauthenticated but `throttle`d, and returning only the minimal display/status fields — never internal notes or IDs beyond the lookup key. Feature-flag consumers fail **open**: a flag-store error or missing flag must not disable the feature it gates; enforcement caches the probe briefly (~30s) rather than calling per request.
