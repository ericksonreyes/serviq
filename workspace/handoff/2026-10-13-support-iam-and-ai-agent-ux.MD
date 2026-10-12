# Handoff — 2026-10-13 — Support IAM split + AI agent UX hardening

## Done This Session

- **Nav reorder** (`tenant-console/Layout.jsx`): Overview → Dispatch → Support → Administration; Customers moved into the Support section (route stays `/admin/customers`).
- **Least-privilege IAM** (`identity-access-backend`): new `iam.invitations.manage` permission; `Customer Support` default bundle = `requests.manage` + `iam.invitations.manage`; `RequirePermission` now variadic any-of; invites route accepts either key; `InvitationController` restricts invitation-only callers to `Customer` invites; backfill migration `2026_10_12_000001_grant_customer_support_permissions.php`; `Customers.jsx` gates create/invite cards on JWT permission claims; **ADR-0022** written + indexed. IAM suite: 25 tests green.
- **AI agent fixes** (`serviq-ai-agent`): added FastAPI `CORSMiddleware` (none existed — browser preflight failed); `urlopen` timeouts 60s/120s → 300s (client was aborting mid-model-load → Ollama canceled the load every time); `run_chat` now forwards `data` rows in `tool_calls` (structured results were being dropped).
- **Actionable chat results** (`CommandBox.jsx`): renders `data` rows as clickable items — agents → `/admin/agents`, requests → `/dispatch/requests?request=<id>` (deep-link support added to `Requests.jsx`), recommendations → `/dispatch/jobs?job=<id>`; listing-style reply suppressed when rows render.
- **"Thinking" loading idiom** — input disables + button animates the ellipsis 1/s while an AI call is in flight. Shared `ThinkingLabel` in console `ui.jsx` (CommandBox + ChatPanel); `ThinkingDots` in portal `ChatWidget` and new `service-agent-frontend/src/ThinkingDots.jsx` applied to the two AI-parse submits (JobDetail receipt, TurnIn deposit slip — both hit `aiParse` in the BFF).
- **Repaired a pre-existing broken test**: `TenantAdministratorScopeTest` referenced nonexistent `TENANT_ADMINISTRATOR_PERMISSIONS` and didn't seed the permission catalog.

## Current State

- Docker VM was 4.8 GiB — **below the documented 5 GiB minimum** (`LOCAL_RESOURCE_BUDGET.MD`); both `qwen2.5:3b` and `moondream` OOM-killed on load. User raised the VM to ~6 GiB; both models verified loading + generating live. Everything works now.
- All changes **uncommitted**, hot-reloaded live (uvicorn `--reload`, vite HMR — all files transform clean).
- `test.sh` contract-check still flags the pre-existing `GET /api/v1/providers` miss (customer portal BFF) — unrelated, untouched.
- Permission changes need **re-login** — new JWTs carry the new claims; stored roles were backfilled by the migration.

## Decisions Made

- `iam.invitations.manage` over granting `iam.users.manage` — the latter also covers user create/disable + role assignment; too broad for support.
- Invitation-only callers limited to `Customer` invites — agent accounts carry `jobs.execute`/`billing.payments.record`; agent invites keep requiring `iam.users.manage`.
- CORS `*` hardcoded — matches Laravel dev default (`config/cors.php`); bearer auth, no cookies → no credentials flag.
- Kept `OLLAMA_KEEP_ALIVE=2m` + `MAX_LOADED_MODELS=1` — deliberate RAM conservation; sized client timeouts to survive cold loads instead of changing the policy.
- Keep `qwen2.5:3b` despite size — only one model is ever resident, so it costs disk (~1.9 GB) not RAM; keywords already cover canned queries but the model buys phrasing flexibility.
- Result rows deep-link to owning pages — the command box is a shortcut surface, not a transcript.
- "Thinking" idiom scoped to AI round-trips only — plain API submits (turn-in count, status changes) keep normal busy states; mislabeled "Thinking" would misrepresent them.

## Next Steps

1. Draft a commit when the user asks (AGENTS.md: draft only) — diff is self-contained across IAM + frontends + ai-agent.
2. Verify Customers page end-to-end as a re-logged Customer Support user (new claims → both cards usable).
3. Fix `.env` var-name drift in `serviq-ai-agent/.env`: code reads `AI_TEXT_MODEL`/`AI_VISION_MODEL`, the file sets inert `OLLAMA_*` names — works only because defaults coincide.
4. Optional: per-agent detail/`?agent=` deep-link — agent result rows currently land on the roster page.
5. Backlog (pre-existing, not this session's scope): `/api/v1/providers` contract miss; IAM `composer.lock` drift; BFFs :8000/:8001 lack CORS headers (same `Access-Control-*` fix needed if portals hit it); avoid `qwen3` as text model — `<think>` blocks break the strict `json.loads` parse.

## Key Files

- `workspace/specs/decisions/0022-least-privilege-invitations.MD` — the permission-split rationale.
- `services/serviq-ai-agent/app/{main,orchestrator,parser}.py` — CORS, data passthrough, timeouts.
- `services/serviq-tenant-console-frontend/src/components/{CommandBox,ChatPanel,ui,Layout}.jsx` — results rows + Thinking idiom + nav order.
- `services/serviq-service-agent-frontend/src/ThinkingDots.jsx` + `pages/{JobDetail,TurnIn}.jsx`; `serviq-customer-portal-frontend/src/ChatWidget.jsx`.
- `services/serviq-identity-access-backend/database/migrations/2026_10_12_000001_grant_customer_support_permissions.php` — role backfill.
- `workspace/specs/technical/infrastructure/LOCAL_RESOURCE_BUDGET.MD` — the 5 GiB floor.
