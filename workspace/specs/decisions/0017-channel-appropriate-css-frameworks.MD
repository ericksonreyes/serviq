# ADR-0017: Channel-appropriate CSS — MUI for end-user channels, Tailwind for internal admin

- Status: Accepted
- Date: 2026-10-10

## Context

Material UI was already pinned for the Customer Portal while the other three frontends had no
component library decided. Options ranged from one library everywhere to a different one per
channel (Tailwind for Tenant Console, Bootstrap for Platform Admin were proposed).

## Decision

- **Material UI** on end-user channels: Customer Portal and Service Agent PWA — accessibility
  defaults, polished components, mobile/PWA-friendly controls.
- **Tailwind** on internal admin UIs: Tenant Console and Platform Admin — utility-first suits
  dense custom layouts (dispatch boards, queue tables) that don't map to Material components.
- Shared framework stays React + Vite everywhere (ADR-0008) — only the styling layer differs.

## Alternatives considered

- MUI everywhere — most consistent, but Material components fight dense admin layouts; rejected.
- Tailwind everywhere — lighter, but consumer channels would need hand-built a11y/components.
- Bootstrap for Platform Admin — works, but reads dated and adds a third styling toolchain for
  no distinct benefit; Tailwind covers it.

## Consequences

- Two styling conventions to maintain instead of one — bounded and documented per channel.
- Components can't be shared across the MUI/Tailwind boundary; acceptable since channels share
  little UI.
- The split itself is the narrative: consumer channels get a component system, internal tools
  get utility CSS — per-channel fit, not fashion.

See: `technical/SERVICE_STACKS.MD`, `SERVICE_MAP.md`; `.devin/skills/frontend/SKILL.md`.
