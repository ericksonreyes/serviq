# ADR-0028: PostgreSQL Row-Level Security as tenant-isolation safety net — Billing first

- Status: Accepted
- Date: 2026-10-14

## Context

Tenant isolation is enforced entirely at the application layer: the JWT
`tenant_id` claim is authenticated once at the edge, `tenantScope`
rejects path/claim mismatches, and every query and bound model
re-applies `tenant_id`. That model is correct and stays first-class —
but it has a known failure mode: **a forgotten `where('tenant_id')` on
any future query leaks rows silently**. Reports, exports, and hastily
added endpoints are the realistic leak surface, and Billing holds the
highest-consequence data (invoices, payments, remittances).

Row-Level Security moves the last line of defense into Postgres: a
policy evaluates `tenant_id = current_setting('app.tenant_id')` on
every query, so an unscoped query under a tenant context returns
zero rows instead of another tenant's ledger. It is defense-in-depth,
not a replacement — the application contract remains the mechanism of
record.

## Decision

Billing is the showcase slice; rollout to other services is deferred
(the pattern is identical per service, and the demonstration value
saturates at one).

- **RLS policy** on every tenant-bearing Billing table
  (`invoices`, `payments`, `payment_evidence`, `remittances`,
  `remittance_items`, `company_accounts`, `outbox`):
  `ENABLE` + `FORCE ROW LEVEL SECURITY` + one permissive policy per
  table pinned to `current_setting('app.tenant_id', true)` for `USING`
  and `WITH CHECK`. Permissive is load-bearing: a table whose only
  policies are `AS RESTRICTIVE` denies every row — restrictive policies
  narrow permissive grants, they don't grant. Tables without their own
  `tenant_id` (`invoice_events`, `remittance_items`) gate via `EXISTS`
  on the parent. `processed_events` is global (consumer dedupe spans
  tenants) and intentionally unprotected.
- **Request path** — `SetTenantContext` middleware runs after JWT auth
  and `tenantScope`, issuing `SET app.tenant_id = '<jwt tenant>'` on
  the connection. Verified on the live stack: HTTP requests under
  `serviq_app` return the tenant's rows while direct psql access with
  no GUC returns zero.
- **System paths bypass** — consumers, `outbox:publish`, migrations,
  and seeders legitimately span tenants. `AppServiceProvider` listens
  to `CommandStarting` and `SET`s `app.is_system = 'on'`; the policy
  ORs that flag in. This keeps one DB role while making the bypass an
  explicit, greppable decision rather than ambient privilege.
- **Dedicated non-privileged role `serviq_app`** — this is mandatory,
  not cosmetic: the `serviq` bootstrap user is a Postgres **superuser**
  (`rolsuper` + `rolbypassrls`), and superusers bypass RLS
  unconditionally regardless of `FORCE`. `serviq_app` is created as a
  member of `serviq` (inherits table privileges; the same DDL works for
  migrations) by `services/postgres/init/01-app-roles.sql`, and
  Billing's runtime env points at it. Console processes keep the
  `is_system` bypass rather than a second credential.

## Consequences

- The layered model is now: **JWT claim** (identity) → **application
  scoping** (the contract — `where`, `abort_unless`, permission
  middleware) → **RLS** (the net — a forgotten scope fails closed to an
  empty set, not open to a leak).
- `SET` is used, not `SET LOCAL`: Laravel doesn't wrap every query in a
  transaction, so the GUC is set once per request on the connection.
  PHP-FPM serves one request per pooled connection, and the next
  request re-`SET`s before any query — cross-request leakage requires
  a request to run a query before middleware, which the route group
  structure prevents.
- RLS answers exactly one question — *is this row the right tenant's?*
  It does not express roles, permissions, or customer-vs-dispatcher
  visibility; all of that stays in the application layer. It also does
  not replace row locking: `lockForUpdate` still guards intra-tenant
  races (double settlement, guarded offer accept) — concurrency and
  isolation are orthogonal properties.
- Every other service still relies on application scoping alone.
  Extending the pattern is mechanical (role grant + policy migration +
  middleware) when a service's blast radius justifies it.
