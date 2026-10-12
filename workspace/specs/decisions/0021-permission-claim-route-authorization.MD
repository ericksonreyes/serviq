# ADR-0021: Route authorization by JWT permission claims, catalog defined in code

- Status: Accepted
- Date: 2026-10-12

## Context

Roles existed end-to-end (IAM issues `roles` + `permissions` JWT claims; every Laravel
service ships a registered `RequirePermission` middleware), but no domain route consumed
them. Platform Management gated its whole API on the role-name string
`Platform Administrator`; every other service ran `jwt.auth` + `tenant.scope` only, so
any authenticated tenant user could perform any write in any bounded context. A role
created in the admin UI was a badge, not a control — the same "UI implies a capability
the code doesn't have" anti-pattern fixed earlier for plan features and feature flags.

## Decision

Authorization is expressed as **permission claims on the JWT, checked per route by the
service that owns it**. IAM defines the only valid keys in `Permission::CATALOG`; role
bundles for canonical roles (`TENANT_DEFAULT_PERMISSIONS` in
`TenantCreatedHandler`) are provisioned per tenant and resynced idempotently. Writes are
gated with `permission:<key>` middleware; reads stay open behind `jwt.auth` +
`tenant.scope`. Platform Management's `role:Platform Administrator` hardcode is replaced
by `permission:platform.admin`.

The matrix (catalog order):

| Permission | Granted to | Gates writes in |
|---|---|---|
| `platform.admin` | Platform Administrator | platform-management (entire API) |
| `workforce.agents.manage` | Tenant Admin | agent create/update |
| `catalog.services.manage` | Tenant Admin | catalog, pricing, repair guides, service areas, tenant settings |
| `dispatch.assignments.manage` | Tenant Admin, Dispatcher | dispatch rules, assign/broadcast, job lifecycle (confirm/ready/cancel/reschedule/replay), request→job convert |
| `jobs.execute` | Tenant Admin, Dispatcher, Service Agent | self-assign, offer accept/reject, job start/steps, execution check-in/evidence/complete |
| `requests.manage` | Tenant Admin, Dispatcher, Customer | customer records/addresses, request create/cancel/feedback |
| `billing.payments.record` | Tenant Admin, Service Agent, Customer | record payments, submit evidence, cash turn-ins |
| `billing.remit` | Tenant Admin, Dispatcher | refund request/execute, evidence review, remittance batches/digital/confirm, payout settle |
| `notify.templates.manage` | Tenant Admin | notification templates and channel settings |
| `iam.*` (6 existing) | per-role | IAM's own admin API (unchanged) |

New permissions may only enter the catalog together with the route gates that consume
them — same rule as plan features and feature flags: **no key without a consumer**.

## Alternatives considered

- Role-name middleware (`role:Dispatcher`) on domain routes — rejected: role names are
  per-tenant strings that can't carry semantics; claims-based permissions let custom
  roles compose real capabilities without code changes.
- Fine-grained per-endpoint permissions (`dispatch.rules.update`) — rejected: 11
  context-scoped keys are legible and match how the channel UIs actually partition work;
  split further only when a concrete need appears.
- Gate reads as well as writes — rejected for now: the portals share list/detail views
  across all tenant users; read gates are a deliberate second pass if data-hiding becomes
  a requirement.
- Coarse `tenant.admin` super-permission — rejected: invisible to audit and blocks the
  demo's purpose (custom roles must visibly do something).

## Consequences

- Custom roles created in `/users` are real: granting `billing.remit` lets that user
  settle payouts; granting nothing restricts them to reads.
- **Claims refresh on login only** — permission changes apply on the user's next JWT;
  there is no mid-session revocation beyond `exp`/blacklist (consistent with ADR-0007).
- Unauthorized calls get a uniform `403 {error: "forbidden", message: "Missing required
  permission: <key>"}`.
- `serviq-customer-support-backend` (Express/TypeScript) has no `RequirePermission`
  equivalent yet — its routes remain auth+tenant scoped until a TS port of the same
  claim check lands.
- Frontend error surfaces should treat 403 as "your role can't do this," not a generic
  failure — channel UIs may later hide actions by permission claim.

See: `technical/README.MD`, ADR-0001 (IAM sole issuer), ADR-0002 (tenant scoping),
ADR-0007 (`exp` fallback).
