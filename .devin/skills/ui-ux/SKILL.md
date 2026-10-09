---
name: ui-ux
description: ServIQ UX rules — NN/g principles applied to channels, field/mobile constraints, status feedback, error prevention in money flows
allowed-tools:
  - read
  - grep
  - glob
---

UX rules for building ServIQ interfaces. Source: `workspace/specs/technical/user_experience/README.MD` (nine principles, NN/g-grounded). This skill applies them to ServIQ's reality.

## Per-channel context

- **Customer Portal** — consumer-grade: browsing, booking, tracking, payment. Assume zero training; every flow must survive on a phone.
- **Service Agent PWA** — field conditions: one-handed use, gloves, sunlight, intermittent connectivity. Big touch targets, offline tolerance, glanceable status.
- **Tenant Console** — dispatcher/admin density: tables, queues, timelines. Density is fine here; clarity and consistency still apply.
- **Platform Admin** — low-frequency admin; favor explicit, safe, boring forms.

## Invariants

- **Visibility of status always** — every async action (submit evidence, broadcast offer, request remittance) gets immediate acknowledgment + an honest pending state. Jobs/offers/payments are long-running; never leave the user guessing.
- **Money flows are error-prevention zones** — cash remittance, refunds, shortfall deductions: confirm amounts, show the expected vs counted figures side by side, require explicit confirmation for variance acceptance. Recovery paths (manual recount override) must be discoverable, not hidden.
- **Errors say what to do next** — not "invalid input" but "amount doesn't match receipt — re-upload or flag for review."
- **AI output is never presented as truth** — parsed document fields render as suggestions to confirm, with the source image alongside. The domain decides; the UI frames AI output as evidence, not verdict.
- **Real-time where it matters** — broadcast offers, tier timeouts, job status flashes use the real-time delivery port; dashboards may poll.
- **Accessibility floor** — keyboard navigable, contrast-checked, semantic labels; PWA must remain usable on small screens.

## When writing UI code

Reuse the channel's component patterns; don't invent new interaction idioms per screen (consistency principle). If a flow lacks a spec, check `domain/specs/` for the owning context's rules before designing the screen.
