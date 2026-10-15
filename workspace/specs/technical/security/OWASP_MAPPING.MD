# OWASP Top 10 (2021) Mapping

Where each category lands in this codebase — the mechanism that addresses it,
the test evidence, and honest gaps. This is a local-development POC, so some
categories are deliberately out of scope; the point of this table is that the
scope was *chosen*, not missed.

| Category | Posture | Mechanism | Test evidence |
| --- | --- | --- | --- |
| **A01 Broken Access Control** | **Addressed — defense in depth** | JWT `tenant_id` claim vs path (`RequireTenantScope`); `where('tenant_id')` + bound-model `abort_unless` on every tenant row; permission claims gate mutations (ADR-0021); default-deny routes; Postgres RLS as the fail-closed net under all of it (ADR-0028) | `TenantAdministratorScopeTest` (cross-tenant read/write → 403); `TenantIsolationTest` (unscoped query sees only pinned tenant; Postgres-only); `InvitationFlowTest` + `RefundFlowTest` (missing permission → 403) |
| **A02 Cryptographic Failures** | **Addressed for tokens; transport is dev-scoped** | RS256 — IAM alone holds `JWT_PRIVATE_KEY`, resource services get the public key only; refresh tokens persist as sha256 (`token_hash`), so a leaked row can't mint access; `JWT_SECRET` HS256 fallback is flagged local/test-only and logs a warning when it resolves | `RefreshTokenTest` (rotation, revocation, garbage rejection); boot-warning tests assert the fallback is observable |
| **A03 Injection** | **Partial** | Eloquent parameterization throughout; the RLS GUC setter deliberately uses bound parameters (`set_config(?, ?, false)`), not string interpolation of the tenant ID; React escapes rendered output | No dedicated injection suite — the convention is "no raw SQL interpolation," enforced by review |
| **A04 Insecure Design** | **Addressed at the architecture level** | Threat decisions are explicit docs, not accidents: public edge vs mesh ([INTERNAL_SERVICE_SECURITY](./INTERNAL_SERVICE_SECURITY.MD)), AI is advisory-only and never approves money decisions, per-flow fail-open/fail-closed choices (feature flags fail open; tenant scope fails closed; RLS fails closed) | `ai-degrade.test.mjs` (AI-down degrades safely); the fail-open/closed contracts are asserted in the flows that depend on them |
| **A05 Security Misconfiguration** | **Partial** | Default-deny: new routes are JWT-protected unless declared public; `.env.example` files carry local-safe defaults, no secrets; pre-commit hook blocks secret-shaped content | `contract-check.mjs` verifies route/middleware wiring; smoke checks per service on install |
| **A06 Vulnerable & Outdated Components** | **Gap** | Lockfiles committed (`composer.lock`, `package-lock.json`) so builds are reproducible | **Not addressed** — no Dependabot/`composer audit`/`npm audit` in CI. Acceptable for a POC; first thing a production push would add |
| **A07 Identification & Auth Failures** | **Addressed** | IAM sole issuer; `iss`/`aud`/`exp`/`jti` validated; shared Redis blacklist for pre-expiry revocation (documented `exp`-only fallback when Redis is down); login throttled 5 req/min; refresh tokens rotate, revoke on logout, and reject deactivated users | `RefreshTokenTest`; `login-negatives.mjs` (wrong password + unknown tenant slug refused on all four portals) |
| **A08 Software & Data Integrity Failures** | **Partial** | Event-sourced invoice stream (`invoice_events` is truth); outbox write is atomic with the state change; consumers dedupe via `processed_events` | `OutboxAtomicityTest` (Billing + Job Mgmt); `idempotency-dlq.mjs` (broker suite) |
| **A09 Logging & Monitoring** | **Partial — audit yes, alerting no** | Domain events *are* the security audit trail: `Remittance.Confirmed` carries decision/override context, `Remittance.Rejected` records who refused what; JWT mode + blacklist fallback log warnings rather than silently degrading | Event-payload assertions in `RemittanceFlowTest`; Fluent Bit → stdout locally. **No security-event alerting** — POC non-goal |
| **A10 SSRF** | **Partial** | Outbound targets are fixed configuration (service names, MinIO, RabbitMQ) — no user-controlled URL fetching in the request path; AI agent tools reach only allowlisted service hosts | None — the attack surface is absent rather than defended |

## Security test inventory

| Suite | What it proves |
| --- | --- |
| `services/serviq-identity-access-backend/tests/Feature/Auth/TenantAdministratorScopeTest.php` | Cross-tenant read and write are refused; listings default to the caller's tenant |
| `services/serviq-identity-access-backend/tests/Feature/Auth/RefreshTokenTest.php` | Token rotation, revocation on logout, deactivated-user rejection, garbage rejection |
| `services/serviq-identity-access-backend/tests/Feature/Auth/InvitationFlowTest.php` | Least-privilege invitation — wrong permissions → 403 (ADR-0022) |
| `services/serviq-billing-backend/tests/Feature/TenantIsolationTest.php` | The RLS net: an unscoped query under a pinned tenant sees only that tenant; middleware pins the connection. **Skips on sqlite — Postgres-only; live-stack verification is the intended path** |
| `services/serviq-billing-backend/tests/Feature/RefundFlowTest.php`, `RemittanceFlowTest.php` | Permission gates on money mutations; decision-audit event payloads |
| `tests/e2e/login-negatives.mjs` | Wrong password and unknown tenant slug refused on all four portals |
| `scripts/contract-check.mjs` | Frontend calls vs backend routes resolve; event catalog coverage is complete |

## Checks worth running

```bash
./scripts/test.sh                       # unit/feature suites + contract check (Docker-only)
./scripts/test.sh tests/e2e             # browser suite incl. login negatives — needs the stack up
# Live RLS probes (what ADR-0028 verified):
docker exec infra-postgres psql -U serviq_app -d serviq_billing -tAc \
  "SELECT count(*) FROM invoices"                                    # → 0, fails closed
docker exec infra-postgres psql -U serviq_app -d serviq_billing -tAc \
  "SET app.tenant_id='<tenant>'; SELECT count(*) FROM invoices"      # → that tenant only
```

## Related Documentation

- [Security & Access Control](./README.MD) — JWT flow, tenant isolation in depth
- [Internal Service Security](./INTERNAL_SERVICE_SECURITY.MD) — exposure model
- [ADR-0028](../../decisions/0028-billing-row-level-security.MD) — the RLS layer
- [ADR-0021](../../decisions/0021-permission-claim-route-authorization.MD) — permission catalog
- [SECURITY.MD](../../../../SECURITY.MD) — repo-level postures (dev credentials, fallback notes)
