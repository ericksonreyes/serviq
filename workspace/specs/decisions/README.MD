# Architecture Decision Records

ADRs record the **why** behind ServIQ's architecture — the durable context that specs alone
don't carry. A spec says what is true; an ADR says why it became true and what was rejected.

## Format

```md
# ADR-NNNN: <Short Decision Title>

- Status: Accepted | Superseded by ADR-XXXX | Deprecated
- Date: YYYY-MM-DD

## Context
What forced this decision — constraints, tensions, goals.

## Decision
What we chose, in one or two sentences.

## Alternatives considered
What was rejected and why — one line each.

## Consequences
What this buys us and what it costs.
```

## Rules

- **Immutable once Accepted.** If a decision changes, write a new ADR that supersedes the old
  one — never rewrite history; the rejected-alternative reasoning is the valuable part.
- **One decision per file**, numbered sequentially `NNNN-kebab-case-title.MD`.
- **Link from the affected spec** — an ADR without inbound links is invisible. Conversely,
  specs may reference their ADRs for rationale.
- Keep them short — a page at most. Link to specs for detail.
- Update this index when adding an ADR.

## Index

- [ADR-0001](0001-iam-sole-jwt-issuer.MD) — IAM is the sole JWT issuer (RS256)
- [ADR-0002](0002-platform-management-owns-tenants.MD) — Platform Management owns the Tenant entity; IAM consumes `tenant_id` as scope
- [ADR-0003](0003-constrained-ai-boundary.MD) — AI is parser/advisor only; domain services own decisions
- [ADR-0004](0004-customer-support-bounded-context.MD) — Customer Support owns complaints and refund decisions
- [ADR-0005](0005-payouts-owns-remittance-shortfalls.MD) — Cash-remittance shortfalls are Payouts deductions
- [ADR-0006](0006-identifier-strategy.MD) — UUIDv7 entities, SQID-masked internal IDs, reference numbers are display-only
- [ADR-0007](0007-exp-only-jwt-fallback-without-redis.MD) — `exp`-only validation when Redis is absent or unreachable
- [ADR-0008](0008-single-react-vite-frontend-stack.MD) — React + Vite for all channels; NextJS dropped
- [ADR-0009](0009-laravel-apache-runtime.MD) — `php:apache` (mod_php) for Laravel services; no Lumen, Octane deferred
- [ADR-0010](0010-docker-first-local-poc.MD) — Docker-first full-stack local POC; profiles as memory fallback
- [ADR-0011](0011-dedicated-event-consumer-containers.MD) — Event consumers run as dedicated containers
- [ADR-0012](0012-model-selection-is-configuration.MD) — LLM choice is config, not architecture; `moondream` default
- [ADR-0013](0013-pgvector-vector-adapter.MD) — pgvector as the local vector-search adapter
- [ADR-0014](0014-minimal-local-observability.MD) — Fluent Bit → stdout locally; searchable sink is optional
- [ADR-0015](0015-alpine-images-where-safe.MD) — Alpine where official/safe; `php:apache` and `python:slim` stay Debian
- [ADR-0016](0016-compose-file-conventions.MD) — `services/docker-compose.yml` tracked; secrets stay in gitignored `.env`
- [ADR-0017](0017-channel-appropriate-css-frameworks.MD) — MUI on end-user channels, Tailwind on internal admin UIs
- [ADR-0018](0018-docs-as-generated-artifacts.MD) — Playwright-generated screenshots/recordings; docs visuals are artifacts, not manual captures
- [ADR-0019](0019-nestjs-customer-support.MD) — NestJS at the domain tier (superseded by ADR-0020)
- [ADR-0020](0020-express-customer-support-read-model.MD) — Support backend on plain Express+Node
- [ADR-0021](0021-permission-claim-route-authorization.MD) — Route authorization by JWT permission claims; permission catalog defined in code
- [ADR-0022](0022-least-privilege-invitations.MD) — `iam.invitations.manage` splits invites from user management; Customer Support gains a default bundle
- [ADR-0023](0023-hierarchical-admin-coverage-gate.MD) — Coverage as admin-hierarchy codes + ancestor walk; CRM gates booking via Service Management's check
- [ADR-0024](0024-mid-flight-reassignment.MD) — Dispatcher reassign allowed on any open job; `Job.Reassigned` moves the agent without rewinding the lifecycle
- [ADR-0025](0025-server-side-availability-gate.MD) — CRM re-validates `scheduled_for` against Service Management's availability probe; operations summary exposes hours/closures to customers
- [ADR-0026](0026-agent-remittance-via-e-wallet.MD) — Agent-held collections may remit via e-wallet: payments gain an agent/company holder split and turn-ins gain a channel with receipt evidence + reference dedupe
- [ADR-0027](0027-agent-remittance-via-bank-or-remittance-center.MD) — Agent turn-in channels extend to bank deposit and remittance-center receipts: all non-cash rails settle all agent-held collections under the same verify-arrival rules
- [ADR-0028](0028-billing-row-level-security.MD) — PostgreSQL RLS as tenant-isolation safety net, showcased in Billing: `SetTenantContext` GUC + `serviq_app` non-superuser role + `is_system` console bypass; JWT and application scoping stay first-class
