# ADR-0008: React + Vite for all channel frontends; NextJS dropped

- Status: Accepted
- Date: 2026-10-10

## Context

The original map used NextJS for Tenant Console and Platform Admin, React for the customer
channels. On the 8GB reference machine every always-on process matters, and all four apps are
post-auth, API-driven SPAs — SSR/SEO benefits of NextJS don't apply.

## Decision

All four channel frontends (Customer Portal, Service Agent PWA, Tenant Console, Platform
Admin) are React (latest) + Vite, shipped as static builds served by `nginx:alpine`. Dev
servers run only for the app under active edit.

## Alternatives considered

- Keep NextJS for internal apps — ~500MB+ of always-on Node servers for zero SSR benefit;
  also a stack the owner hasn't studied.
- Mixed stacks "for breadth" — breadth for its own sake is weaker signal than a deliberate
  single-stack decision.

## Consequences

- Frontend tier is ~40MB total at runtime; no Node processes.
- One toolchain, one mental model, one dependency story.
- If SEO/public content ever matters, that channel needs a revisit — non-issue for the POC.

See: `technical/SERVICE_STACKS.MD`; `.devin/skills/frontend/SKILL.md`.
