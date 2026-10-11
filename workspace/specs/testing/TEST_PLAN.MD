# Test Plan

Layer-by-layer strategy for automating ServIQ coverage. Ordered by priority — the money path and security boundaries gate first, CRUD surfaces last.

## Priorities

| Tier | What | Why first |
| --- | --- | --- |
| P0 | Billing/remittance/evidence, payouts, JWT auth + tenant scoping, event-handler correctness | money and security — a bug here is fraud or a breach, not a UX glitch |
| P1 | Request→job→assign→execute lifecycle, dispatch offers/expiry, reschedule rules, refund chain | the product spine — regressions break the demo end-to-end |
| P2 | Catalog/pricing/areas/settings, workforce agents, platform tenant lifecycle, invitations | important but boring CRUD + lifecycle |
| P3 | Notifications routing/templates, BFF projections, AI eval accuracy, browser E2E | correctness is observable; highest maintenance cost per test |

## Layer 1 — Unit tests

Pure logic, no DB. Cheapest signal; every service should carry a few for its riskiest classes.

| Service | Candidates |
| --- | --- |
| billing | `RemittanceService` decisions (matched/variance/flagged), guardrails (dup-ref, claimed_mismatch, under_remitted), `PayoutPolicy` splits |
| payouts | clawback-ledger math (shortfall apply/applied_cents), deduction idempotency |
| service-job | reschedule transition rules, workflow-step ordering |
| dispatch | eligibility scoring, offer TTL ranking |
| identity | role/permission resolution, invite token issue/accept expiry |
| ai-agent | stub heuristic parser, schema mapping (`/parse` output shape), tool-arg validators |

## Layer 2 — Feature/API tests

Each service through its real HTTP kernel against sqlite — the `RemittanceFlowTest` pattern. Every endpoint should cover, at minimum: **401 unauthenticated, cross-tenant denial/404, 422 on bad input, happy-path transition, outbox row written.** These five assertions per route are the bulk of the coverage value.

| Service | Key surfaces (routes to cover) |
| --- | --- |
| billing | evidence intake + review, turn-in/batch/digital, confirm decisions, refund-request lifecycle, invoice pay dup-ref 409 |
| payouts | list, settle (disbursement port mock), deduction rows |
| identity | register/login/logout/me, users+roles+permissions CRUD, invitations show/accept |
| platform | tenants CRUD + lifecycle transitions, plans, subscriptions, flags, settings, metrics, income |
| service-mgmt | services+steps+pricing, areas, settings, repair guides, availability |
| crm | customers+addresses, requests CRUD/cancel/convert/feedback |
| job-mgmt | jobs lifecycle, reschedule restrictions |
| workforce | agents CRUD + eligibility |
| dispatch | queue, assign/broadcast/recommend, offer accept/reject/expire |
| field-execution | executions, check-in/steps/complete, evidence list+upload |
| support (Express) | cases+notes+status, refund decisions |
| bffs (supertest) | proxy fanout paths, auth pass-through, 401 handling |
| ai-agent (pytest TestClient) | `/parse` stub mode shape, `/chat` tool routing + auth rejection |

## Layer 3 — Contract tests

Two contract surfaces need pinning; both regress silently today.

- **Event payloads.** The [event catalog](../domain/specs/domain_events/EVENT_CATALOG.MD) is the declared contract — for every emitted type, assert the payload keys at emit time in the publisher's feature test, and assert the consumer's handler tolerates the documented payload in its own feature test. Emitted-but-unhandled types (`Support.RefundDecided` in payouts) and handler-without-emitter are both caught here.
- **BFF fanout.** The frontend→BFF→upstream chain breaks on path typos that nothing compiles. A lightweight contract check: enumerate `api.js` paths per frontend against BFF route tables and upstream `routes/api.php` — automatable as a static check script, cheaper than browser tests.

## Layer 4 — Integration tests

Real broker, real consumers — the only way to verify emit→consume→project. Options:

- **Compose test profile** — `docker compose` with a `test` service per flow: seeds data, triggers the HTTP action, polls the consumer's read model/DB for the projection. Highest fidelity, slowest.
- **In-container broker** — run rabbitmq + two services' consumers, publish the real event envelope, assert handler side-effect. Cheaper than full stack.

P0 flows: `Job.Completed` → invoice issued; `Remittance.ShortfallAccepted` → payout deduction row; `Support.RefundDecided` → refund request approved; `Identity.InvitationCreated` → email-channel notification row; `Platform.TenantCreated` → IAM tenant scope.

## Layer 5 — Eval tests

`app/eval.py` measures field-extraction F1 in stub mode — extend the golden fixture set as real receipt shapes accumulate (e-wallet layouts, bank slips, cash photos). Gate: F1 must not regress on schema-mapped fields. Live-model evals run manually (ollama mode, measured ~30s cold per image) — not a CI gate.

## Layer 6 — Smoke tests

`install.sh` stage 5 hits `/api/health` on all ports — keep it honest (the port fix already landed). Extend to one golden-path assertion per service beyond health (e.g. catalog list returns seed data) so "up" means "functional," not just "listening."

## CI proposal

- **PR gate:** per-service unit+feature tests (PHP 8.4 image, sqlite — no infra needed) + the BFF contract static check. Fast, no broker.
- **Nightly:** compose integration profile — the five P0 event flows + full smoke.
- **On-demand:** AI eval with golden fixtures; browser E2E before releases.

## Non-goals

- No UI snapshot testing of vite internals; browser E2E only for persona flows.
- No load/perf gating — the stack targets demo scale; the resource budget already documents ceilings.
- Mocks-only BFF tests — proxy code is contract-tested at the path level instead.
