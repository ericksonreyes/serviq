# JWT Invalidation

This document describes how ServIQ invalidates JWTs before their natural expiry using a shared Redis blacklist.

## Goals

- Support immediate token revocation (logout, account suspension, permission changes).
- Keep verification consistent across every microservice.
- Bound the size of the blacklist automatically.

## Why a Blacklist

JWT verification is stateless — a valid signature alone cannot tell whether a token has been revoked. ServIQ uses a **shared Redis blacklist** so any service can check revocation status locally without calling Identity & Access per request.

```text
Identity & Access                    Shared Redis
        │                                │
        │  token revoked (logout etc.)   │
        ├───────────────────────────────▶│  jwt:blacklist:<jti> = 1, TTL = remaining token lifetime
        │                                │
        ▼                                ▲
Other services ── signature OK? ── then check blacklist ── reject if present
```

## Validation Flow

On each request, after verifying the signature and standard claims:

1. Read the token's `jti` (unique token ID) claim.
2. Check `jwt:blacklist:<jti>` in the shared Redis instance.
3. Reject the request with `401 Unauthorized` if the key exists; otherwise continue with role/permission policy.

## Rules

- Every issued token must carry a unique `jti` claim — this is the blacklist key.
- Blacklist entries must use a TTL equal to the token's remaining lifetime, so Redis self-cleans once the token would have expired anyway.
- There is **one shared Redis** for the blacklist — services do not run separate per-service blacklist stores.
- Only Identity & Access (and platform-level revocation actions) write to the blacklist; other services are read-only consumers.

## Trade-offs

- Blacklist checks add a Redis call to every authenticated request — verification is no longer purely stateless.
- **No Redis means `exp`-only validation**: if Redis is not configured for the blacklist, or the blacklist is unreachable, services skip the revocation check and rely on the token's `exp` claim instead of failing the request. The cost is that revoked tokens remain valid until they expire — keep token lifetimes short to bound that window.
- The fallback should be observable: log and emit a metric whenever a service cannot reach the blacklist so outages are visible.
- Highly sensitive operations may still require the blacklist check and fail closed if Redis is unreachable, even when the general fallback applies.
- Short token lifetimes reduce how long the blacklist needs to remember revocations.

## Related Documentation

- [Security & Access Control](./README.MD) — JWT validation and role/permission policy
- [Identity & Access (IAM)](./IDENTITY_AND_ACCESS.MD) — token issuance and identity ownership
- [JWT Signing Keys](./JWT_SIGNING_KEYS.MD) — key distribution and signing modes
- [Infrastructure & Local Development](../infrastructure/README.MD)
