# ADR-0022: Least-privilege invitations and the Customer Support bundle

- Status: Accepted
- Date: 2026-10-12

## Context

The Tenant Console's Customers page moved into the Support section so Customer
Support staff can look up and register callers. Two gaps surfaced: customer-record
writes require `requests.manage`, and invitations required `iam.users.manage` — a
permission that also covers creating, disabling, and re-roling users, far more
than a support desk should hold. The canonical `Customer Support` role also had no
default permission bundle at all (`Role::DEFAULT_PERMISSIONS` omitted it), so it
could exercise nothing the UI implies.

## Decision

Amends the ADR-0021 catalog. A new key `iam.invitations.manage` ("Invite customers
and agents into a tenant scope") enters `Permission::CATALOG` together with its
consumer, per the no-key-without-a-consumer rule: the invitations route accepts it
**or** `iam.users.manage` (`RequirePermission` is now variadic any-of). Callers
holding `iam.invitations.manage` without `iam.users.manage` may invite the
`Customer` role only — `Service Agent` invites still require `iam.users.manage`,
since an accepted agent account carries `jobs.execute` and
`billing.payments.record`. `Role::DEFAULT_PERMISSIONS` gains
`Customer Support → requests.manage + iam.invitations.manage`, and a migration
backfills every existing Customer Support role.

## Alternatives considered

- Grant Customer Support `iam.users.manage` — rejected: bundles invitations with
  user-disable and role-assignment powers a support rep must not hold.
- Split into a dedicated customer-invite endpoint — rejected: duplicates an
  existing flow for no new capability; the invitable-role boundary is one check.
- Require `iam.invitations.manage` alone on the route (admins would need it added
  to their bundle) — rejected: `iam.users.manage` already implies full user
  administration; forcing a redundant grant buys nothing.

## Consequences

- Support staff can register and invite customers; they cannot invite Service
  Agents or touch staff accounts.
- `RequirePermission` accepts several keys (any-of) — a pattern other routes can
  reuse for broad-or-narrow permission pairs.
- Per ADR-0021, grants apply to JWTs issued at next login; the migration repairs
  stored role bundles, not live tokens.
- Tenant Console's Customers page hides its write cards from callers lacking the
  underlying claims — the first UI gated on `permissions` rather than role names.

See: ADR-0021 (permission-claim authorization), `technical/security/README.MD`.
