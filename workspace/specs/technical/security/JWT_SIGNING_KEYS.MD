# JWT Signing Keys

This document describes how JWT signing and verification keys are distributed across ServIQ services.

## Goals

- Keep token signing centralized in a dedicated Identity & Access Management (IAM) microservice.
- Let every other microservice verify tokens without being able to sign them.
- Keep local development simple when asymmetric keys are not configured.

## Key Distribution Model

ServIQ uses a dedicated **IAM microservice** as the only token issuer.

- The **IAM microservice holds the private key** and signs access tokens with **RS256** (asymmetric — RSA private key signs, public key verifies).
- **All other microservices hold only the public key** and use it to verify token signatures locally.
- No service outside IAM should ever need the private key.

This means:

- a compromised resource service cannot mint new tokens;
- verification stays stateless — services validate tokens without calling IAM per request;
- rotating the signing key only requires changing IAM and redistributing the public key.

## Configuration

Services resolve their key material from environment variables:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `JWT_PRIVATE_KEY` | IAM only | Private key used to sign tokens |
| `JWT_PUBLIC_KEY` | All other services | Public key used to verify token signatures |
| `JWT_SECRET` | Any service | Shared symmetric secret, used only when the key pair is not supplied |

## Symmetric Fallback

If `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` are not supplied, a service may fall back to a shared secret key in `JWT_SECRET` and use symmetric signing (e.g. HS256).

The fallback exists to keep local development and testing simple — every service can sign and verify with the same value without generating a key pair.

Rules for the fallback:

- `JWT_SECRET` must never be used in production.
- Behavior must be explicit: a service should log or expose which signing mode it resolved at startup, so a missing key pair is visible rather than silently downgrading to symmetric signing.
- Key-pair configuration always takes precedence over `JWT_SECRET` when both are present.

## Notes

- The private key must never be committed to the repository, logged, or exposed through an endpoint.
- Public keys may be distributed freely; a JWKS endpoint on IAM is an acceptable way to publish them if rotation becomes frequent.
- Token validation rules (issuer, audience, expiry, tenant scope) remain the same regardless of which signing mode is in use — see the parent document.

## Related Documentation

- [Security & Access Control](./README.MD) — JWT validation and role/permission policy
- [Engineering Disciplines](../README.MD)
