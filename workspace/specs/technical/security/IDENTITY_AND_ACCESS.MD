# Identity & Access (IAM)

This document describes the responsibilities of the dedicated Identity & Access microservice and how user identity is scoped across ServIQ.

## Goals

- Centralize ownership of identity data in one microservice.
- Keep username uniqueness scoped to the boundary the user belongs to, not global.
- Give every other service a consistent way to identify and authorize users without owning identity data.

## Service Responsibilities

Identity & Access (IAM) is a dedicated microservice that owns all of the following for the entire platform:

- **Users** — user accounts, credentials, and authentication for every tenant and for platform-level users.
- **Roles** — role definitions and role assignments.
- **Token issuance** — signing JWTs with its private key; see [JWT Signing Keys](./JWT_SIGNING_KEYS.MD).

IAM does **not** own the Tenant entity. The tenant record — business details, subscription, plan, lifecycle — belongs
to Platform Management. IAM learns a `tenant_id` as an authorization scope via provisioning (a `TenantCreated` event
or API call from Platform Management) and manages users and roles within that scope.

Other services never store user accounts or credentials. They trust the claims issued by IAM.

## Tenant-Scoped Usernames

A username is only unique **within the scope it belongs to** — it is not globally unique across the platform.

```text
Tenant A          Tenant B          Platform
   │                 │                 │
erickson          erickson          erickson
   │                 │                 │
   └── three distinct identities, each unique in its own scope ──┘
```

This means:

- `erickson` in Tenant A and `erickson` in Tenant B are **different users**.
- Platform-level users live in their own scope, so `erickson` at the platform level is again a distinct identity.
- Authentication always resolves the pair `(scope, username)`, never the username alone.

## Identity Rules

- The uniqueness constraint is `(tenant_id, username)` for tenant users and `(scope, username)` generally.
- Every user also has a **globally unique internal user ID** (UUIDv7); services should reference users by this ID, not by username.
- Tokens issued by IAM carry both the user ID and the tenant scope claim, so downstream services can disambiguate identical usernames.
- No service may infer identity from username alone — a username without a scope is ambiguous.

## Accountability

Audit fields across the platform use the IAM user ID:

- `created_by`, `updated_by`, and similar accountability columns store the user's UUIDv7 from the token's `sub` claim — never the username.
- Tenant and other entity identifiers follow the platform-wide rules in [Identifiers](../IDENTIFIERS.MD).

## Notes

- Tenant business data (services, jobs, settings) stays in the tenant's bounded contexts; IAM owns only the identity and access side.
- Role names may also repeat across tenants — roles are defined and assigned per scope, the same way usernames are.

## Related Documentation

- [Security & Access Control](./README.MD) — JWT validation and role/permission policy
- [JWT Signing Keys](./JWT_SIGNING_KEYS.MD) — key distribution and signing modes
- [Domain Boundaries](../../domain/specs/DOMAIN_BOUNDARIES.md) — Identity & Access bounded context
- [Glossary & Vocabulary](../../GLOSSARY.MD)
