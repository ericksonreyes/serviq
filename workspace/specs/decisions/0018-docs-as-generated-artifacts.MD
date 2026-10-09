# ADR-0018: Documentation visuals are generated artifacts — Playwright-driven screenshots and recordings

- Status: Accepted
- Date: 2026-10-10

## Context

ServIQ needs user guides and demo visuals for four frontends. Hand-captured screenshots
rot the moment the UI changes, and re-taking them manually is exactly the kind of
maintenance debt that never gets paid. The project also wants the docs themselves to
demonstrate engineering discipline.

## Decision

- All screenshots/recordings in docs are produced by **Playwright scripts** run against
  the running `full` Docker profile — never captured by hand.
- Scripts live in `scripts/screenshots/<channel>/<flow>.spec.ts`; generated output in
  `docs/screenshots/`; per-channel guides in `docs/guides/`.
- Video walkthroughs use Playwright `recordVideo` → `ffmpeg` conversion for README/GIF
  embedding.
- Conventions live in the `.devin/skills/user-guide` skill.

## Alternatives considered

- Manual screenshots — zero tooling, but they rot immediately; rejected.
- Storybook/Chromatic — isolated component shots, but a second toolchain; component-level
  coverage isn't needed at POC scale. Revisit if component docs become a need.
- Static written docs without visuals — cheapest, but the demo value of visuals was the
  point of the request.

## Consequences

- `docs/` becomes partially generated — contributors must re-run capture scripts, not
  paste images.
- Playwright becomes a dev dependency once the first frontend lands; adds a Node
  toolchain outside the per-app builds.
- Docs freshness is enforceable: a screenshot that doesn't regenerate is a broken build,
  not stale prose.
- CI can later publish `docs/` to GitHub Pages — generated docs as artifacts is the
  portfolio narrative this sets up.

See: `.devin/skills/user-guide/SKILL.md`, `.devin/skills/frontend/SKILL.md`;
`BUILD_SEQUENCE.MD` (phase 7 — channels).
