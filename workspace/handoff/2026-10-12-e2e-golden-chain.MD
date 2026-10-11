# Handoff — 2026-10-12 — E2E golden-chain spike

## Done This Session

- Built the Playwright proof-of-concept the previous session proposed: `tests/e2e/golden-chain.mjs` — customer books → dispatcher converts → auto-assign → agent checks in, three browser contexts, three event hops. **PASS**, run repeatedly (3 green runs).
- Wired it into the runner: `./scripts/test.sh tests/e2e` — opt-in, needs the live stack; not part of the default `services/*` glob.
- Added `tests/e2e/package.json` (`playwright` exact-pinned to match image browsers) + `.gitignore` for its `node_modules`.
- Added `server.allowedHosts: true` to all four `vite.config.js` — vite blocks container-network hostnames otherwise.
- Documented the E2E conventions + discovered bugs in `workspace/specs/testing/README.MD` ("Browser E2E conventions", "E2E-found product gaps").

Real defects the spike caught and fixed:
- `services/serviq-identity-access-backend/…/TenantCreatedHandler.php` — `firstOrCreate` → `updateOrCreate` (scope rows provisioned before slug projection stayed slug-NULL → tenant-slug logins rejected).
- `services/serviq-workforce-management-backend/…/DemoAgentSeeder.php` — now emits `Workforce.AgentRegistered` via outbox AND links `user_id` to anna.agent's IAM id (cross-DB lookup).
- `services/serviq-workforce-management-backend/…/AgentController.php` — added `?user_id=` filter to agents index (BFF resolution needs it).
- `services/serviq-service-agent-bff/src/index.js` — `resolveAgentId()`: IAM `sub` → workforce `agents.id` via `user_id`; applied to home, me/jobs, offer accept/reject, remittances.
- Frontend `.env` files fixed live (not tracked): `VITE_API_BASE_URL` was `localhost:3000/3001` — should be `localhost:8000/8001` — every data call returned vite's index.html. **The portals were broken on the host too.** `.env.example` values were already correct.

## Current State

- Golden chain is green through `test.sh`; the full unit/feature suite was already green before this session.
- Live env healed: `tenant_scopes.slug='acme'` backfilled, Anna projected into `serviq_dispatch.agents`, `user_id` linked.
- `git status`: 11 modified files + untracked `tests/` — all this session's work is **uncommitted**; user drafts/commits manually (AGENTS.md: draft messages only).
- Known flake, handled: IAM `throttle:5,1` on login — test backs off 65s on "Too Many Attempts" (3 logins/run share the container IP).

## Decisions Made

- Playwright runs in `mcr.microsoft.com/playwright:v1.55.0-noble` — Docker-only policy; browsers baked in image; npm dep pinned exact (caret resolves newer than baked browsers → crash).
- `--host-resolver-rules=MAP localhost <docker-gateway>` — frontends bake `VITE_*=localhost:PORT`; remapping the *browser's* localhost reaches host-mapped ports with zero config changes.
- Post-login navigation is click-only — tokens live in React state; `page.goto` reload loses auth.
- Seed the `requested→confirmed→ready` transitions via API — console exposes no UI for them; testing a UI path that doesn't exist would be fiction.
- Assert the *automatic* assign path — `assignment_rules` is empty → default `automatic` strategy assigns on ReadyForAssignment; manual Assign UI only exists for `self`/`broadcast` tenants.

## Next Steps

1. **Still-open product gap:** console needs UI for `requested → confirmed → ready_for_assignment` (or auto-confirm on convert). Decide; then remove the API-seed block from `golden-chain.mjs`.
2. Expand E2E: agent offer-reject/expiry pair; login negatives (wrong password, wrong-tenant slug); dispatcher cancel mid-flight; the `self`/`broadcast` manual-assign path (needs a second tenant strategy).
3. Decide whether `POST /agents` should set `agents.id = user_id` when linked — the BFF resolution bridges it either way, but the identifier policy deserves a decision note (`software-engineering` skill).
4. Feature inventory: `APP_FEATURES.MD` marks should reflect the fixed flows (dispatcher assign, agent job visibility) — review per `feature-inventory` skill.
5. Draft commit message when user asks — this session's diff is self-contained (test infra + three production fixes + docs).

## Key Files

- `tests/e2e/golden-chain.mjs` — the spike; header comment documents the runtime + invariants.
- `tests/e2e/package.json` — `playwright: 1.55.0` exact pin.
- `scripts/test.sh` — Playwright branch at top of the service loop.
- `workspace/specs/testing/README.MD` — Browser E2E conventions + product-gap list.
- `services/serviq-service-agent-bff/src/index.js` — `resolveAgentId` (~line 9); comment decrees the identity bridge.
- `workspace/specs/testing/TEST_SCENARIOS.MD` — the full flow list; golden chain covers #1 only.
