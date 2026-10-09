---
name: service-workflows
description: ServIQ bounded-context map and cross-service flows — request lifecycle, assignment strategies, payment/remittance, refund ownership
allowed-tools:
  - read
  - grep
  - glob
---

Orientation for work that crosses service boundaries. Check ownership BEFORE writing code that spans contexts.

## Canonical sources

- `workspace/specs/domain/specs/DOMAIN_BOUNDARIES.md` — the context map (read this first)
- `workspace/specs/domain/specs/domain_boundaries/` — per-context specs
- `workspace/specs/domain/specs/assignment_strategies/` — automatic / dispatcher / self-assignment
- `SERVICE_MAP.md` — which service implements which context

## Ownership cheat sheet (the parts people get wrong)

- **Tenant entity**: Platform Management. IAM consumes `tenant_id` as authorization scope only — it does NOT own tenants.
- **Refunds**: decided by Customer Support (case work), executed by Billing (payment operation).
- **Complaints**: owned by Customer Support; C&RM is interim intake only.
- **Remittance shortfalls**: recorded as a deduction adjustment in Payouts against the agent's share.
- **Payment evidence parsing**: AI Agent parses → Billing validates/decides. Bank-ledger verification is out of scope → manual review.
- **Notification**: no dedicated frontend — admin views fold into the Tenant Console.
- **Customer Portal & Service Agent**: presentation channels with BFFs, not bounded contexts.

## The core flow

Customer request (C&RM) → service job (Job Management) → assignment offer (Assignment & Dispatch: automatic / dispatcher / self-assign) → field execution (Field Service Execution, evidence to MinIO) → billing settlement (Billing) → agent payout (Payouts, minus shortfall deductions). Notifications fan out via RabbitMQ events + real-time delivery port.

## Channels

- Customer Portal ↔ Customer Portal BFF (has MongoDB read model) → domain APIs
- Service Agent PWA ↔ Service Agent BFF → domain APIs
- Tenant Console / Platform Admin → admin APIs directly (browser-facing, JWT-secured)

If a flow you're implementing isn't in a spec — flag it and propose where it belongs rather than picking an owner silently.
