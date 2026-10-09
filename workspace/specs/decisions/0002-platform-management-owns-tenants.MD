# ADR-0002: Platform Management owns the Tenant entity; IAM consumes tenant scope

- Status: Accepted
- Date: 2026-10-09

## Context

Early specs had both IAM and Platform Management claiming tenant ownership — IAM stored
"tenants" while Platform Management owned tenant lifecycle and subscriptions. Two owners for
one entity guarantees drift.

## Decision

Platform Management is the system of record for the Tenant entity (lifecycle, subscription,
plan). IAM is independent — it receives tenant scope during provisioning and embeds
`tenant_id` in JWTs as an authorization claim, but never owns or mutates tenant records.

## Alternatives considered

- IAM owns tenants — couples identity lifecycle to billing/subscription lifecycle; tenant
  suspension would tangle with credential management.
- Split entity (IAM tenant + PM tenant synced) — duplicate ownership, sync bugs, unclear
  source of truth.

## Consequences

- IAM can be reasoned about as pure identity — a clean, replaceable bounded context.
- Tenant provisioning must notify IAM (event or API) so it can bind users to scope.
- `tenant_id` scoping is enforced by every service on every tenant-owned resource.

See: `domain/specs/domain_boundaries/platform/PLATFORM_MANAGEMENT.MD`,
`technical/security/IDENTITY_AND_ACCESS.MD`.
