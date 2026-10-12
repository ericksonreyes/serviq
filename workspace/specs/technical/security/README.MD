# Security & Access Control

This note shows how a service validates JWT claims and enforces roles and permissions after Identity & Access issues the token.

## Goals

- Keep authentication stateless.
- Trust only signed JWT claims.
- Use roles for coarse-grained access gates.
- Use permissions for finer-grained endpoint or action checks.
- Reject any client-supplied role headers or body fields as a source of truth.

## Middleware / Policy Flow

```text
Incoming request
        │
        ▼
Bearer token extracted
        │
        ▼
JWT signature verified against the IAM public key
        │   (`JWT_PUBLIC_KEY` env var, or an optional JWKS endpoint on IAM)
        │
        ├── validate iss, aud, exp, and tenant scope
        ├── read roles and permissions from the signed claims
        ▼
Service middleware / guard
        │
        ▼
Route or action policy
        ├── require role(s)
        ├── require permission(s)
        └── deny with 401 or 403 when validation fails
```

## Example Authorization Rule

A payout execution endpoint may require both:

- Role: `Tenant Administrator`
- Permission: `payout.execute`

That means the service should:

- verify the JWT signature first
- confirm the token issuer and audience are valid
- trust the `roles` and `permissions` claims only after signature verification
- reject the request with `403 Forbidden` if the role or permission is missing

## Example Policy Pseudocode

```text
if not verifySignature(jwt, jwks):
    return 401 Unauthorized

claims = decode(jwt)

if claims.iss != "serviq-identity-access":
    return 401 Unauthorized

if claims.aud != "serviq-api":
    return 401 Unauthorized

if claims.exp is expired:
    return 401 Unauthorized

if claims.tenant_id != request.tenant_id:
    return 403 Forbidden

if "Tenant Administrator" not in claims.roles:
    return 403 Forbidden

if "payout.execute" not in claims.permissions:
    return 403 Forbidden

allow request
```

## Notes

- Services should not infer access from request headers alone.
- Services should not trust unverified client input for identity or authorization.
- More sensitive actions can require both a role and a permission at the same time.

## Related Documentation

- [Identity & Access (IAM)](./IDENTITY_AND_ACCESS.MD) — dedicated microservice owning tenants, users, and roles; tenant-scoped usernames
- [JWT Signing Keys](./JWT_SIGNING_KEYS.MD) — key distribution between IAM and resource services, plus the symmetric fallback
- [JWT Invalidation](./JWT_INVALIDATION.MD) — shared Redis blacklist for pre-expiry token revocation
- [Internal Service Security](./INTERNAL_SERVICE_SECURITY.MD) — which endpoints are public vs service-mesh-only, and how service-to-service calls authenticate
- [ADR-0021](../../decisions/0021-permission-claim-route-authorization.MD) — the live permission catalog and which routes each key gates
- [Engineering Disciplines](../README.MD)
