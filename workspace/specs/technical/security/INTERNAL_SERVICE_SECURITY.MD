# Internal Service Security

This document defines how ServIQ separates internet-facing endpoints from the internal service mesh, and how
service-to-service calls are authenticated.

## Goals

- Make it explicit which endpoints are publicly reachable and which are not.
- Ensure every request is authenticated regardless of network location.
- Keep the service mesh private without relying on the network as the only control.

## Exposure Model

### Browser-facing endpoints (public)

Reachable over the internet. "Public" describes the network route, not the audience — tenant-facing admin surfaces
are public because Tenant Administrators, Dispatchers, Customer Support, and Service Agents reach them from
anywhere.

- **Customer Portal BFF** — customer traffic
- **Service Agent BFF** — field agent traffic
- **IAM auth endpoints** — login, customer/agent self-registration, and token issuance; anonymous by necessity
- **Tenant self-registration** — `POST /api/v1/tenants/signup` on Platform Management; anonymous service-provider onboarding
- **Domain command APIs** — called directly by the Tenant Console and Platform Admin frontends

Controls on every browser-facing endpoint:

- JWT required on every route except IAM login/registration and tenant self-registration
- Signature verification plus `iss`, `aud`, `exp`, tenant scope, and Redis blacklist checks — see
  [JWT Invalidation](./JWT_INVALIDATION.MD)
- HTTPS only; CORS restricted to known UI origins
- Rate limiting at the ingress, especially on login endpoints, which are the brute-force target

### Service mesh (no public route)

Infrastructure and service-internal endpoints have no public route at all:

- PostgreSQL, MongoDB, Redis, RabbitMQ, MinIO, Ollama
- Endpoints intended only for other services (for example, domain APIs invoked by the AI Agent)

In local development — the current target — this means the Docker bridge network; in any deployed environment it
would mean subnet or security-group isolation. Internal callers still authenticate — network isolation is a bonus
layer, not the control.

## Service-to-Service Calls

- **Synchronous calls propagate the caller's JWT.** Downstream authorization is identical to a direct API call; a
  service cannot do more on the caller's behalf than the caller could do themselves.
- **Async and event-driven work cannot carry the caller's live JWT** — expiry and revocation make event-carried
  credentials invalid. Consumers run under their own service identity and record the on-behalf-of user ID for
  audit.
- No service trusts the network: a request without valid credentials is rejected even from inside the mesh.

## Platform-Admin Hardening (Optional)

Platform-level admin surfaces may additionally sit behind an identity-aware proxy (for example Cloudflare Access,
Teleport, or Tailscale) or an IP allowlist, since platform staff are a known, controlled set. This is optional
hardening on top of JWT enforcement, not a substitute for it.

## Related Documentation

- [Security & Access Control](./README.MD) — JWT validation and role/permission policy
- [Identity & Access (IAM)](./IDENTITY_AND_ACCESS.MD) — token issuance and identity ownership
- [JWT Signing Keys](./JWT_SIGNING_KEYS.MD) — key distribution
- [JWT Invalidation](./JWT_INVALIDATION.MD) — Redis blacklist for pre-expiry revocation
- [AI Agent](../ai/README.MD) — tool-call JWT propagation and async delegation
- [Service Stacks](../SERVICE_STACKS.MD) — BFF policy and per-family stacks
