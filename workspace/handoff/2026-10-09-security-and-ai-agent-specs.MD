# Handoff — 2026-10-09 — Security & AI Agent specs

## Done This Session

- Created `workspace/specs/technical/security/` — `IDENTITY_AND_ACCESS.MD`, `JWT_SIGNING_KEYS.MD`, `JWT_INVALIDATION.MD`, `INTERNAL_SERVICE_SECURITY.MD`.
- Created `workspace/specs/technical/IDENTIFIERS.MD` — UUIDv7 entity IDs, SQID masking, reference-number vs record-ID distinction.
- Created `workspace/specs/technical/ai/` — `README.MD`, `AGENT_PROFILES.MD` (Customer / Dispatcher / Customer Support profiles + command bar), `PROOF_OF_PAYMENT_PARSING.MD` (polymorphic doc auditor), `CASH_REMITTANCE.MD`.
- Full spec audit: created `workspace/specs/AUDIT.MD` (20 findings), then **applied all remediations** — every item now Closed/Fixed, including R4 (no Redis configured or reachable → `exp`-only validation).
- Rebuilt `SERVICE_MAP.md` and repopulated `services/` with 19 placeholder dirs (`.gitkeep` each) after the reset.
- Created `domain_boundaries/service_operations/CUSTOMER_SUPPORT.MD` + `personas/CUSTOMER_SUPPORT.MD`; Customer Support graduated from future-context list.
- `infrastructure/README.MD` — audio transcription port, document/photo parsing port, object storage port (MinIO/S3), real-time delivery port (WebSocket/Redis pub-sub), pgvector selected, tiered local profiles, env-template policy.
- Created `PROJECT_PURPOSE.MD`, `workspace/handoff/` convention, `/checkpoint` + `/restore` skills, AGENTS.md safety guardrails.
- Created `services/docker-compose.yml` — full local stack (postgres+pgvector, mongo, redis, rabbitmq mgmt, minio, fluent-bit→stdout, ollama w/ `OLLAMA_KEEP_ALIVE=2m`), `mem_limit` per service, healthchecks, `infra`/`domain`/`ai`/`full` profiles, `develop.watch` stubs per app service.
- Created `workspace/specs/technical/infrastructure/LOCAL_RESOURCE_BUDGET.MD` (~2.5GB steady-state budget) and `workspace/infra/fluent-bit/fluent-bit.conf`.
- Created 19 `.env.example` templates (Docker-network values) + `scripts/install.sh` (confirm → env copy → fresh-vs-keep → staged bring-up).

## Current State

- All specs cross-linked; link check passes. Nothing mid-flight.
- `services/` contains 19 empty scaffold dirs matching the new service map — no implementations yet.
- All work uncommitted.

## Decisions Made

- **Repo layout**: monorepo folders under `services/`; one frontend per channel (all React+Vite — Customer Portal, Service Agent PWA, Tenant Console, Platform Admin; NextJS dropped — no SSR need, everything is post-auth API-driven static builds); one Laravel backend per bounded context (12); two NestJS BFFs (Customer Portal w/ MongoDB read model, Service Agent w/o read model); one FastAPI AI Agent. Runtime: plain `php:apache` (mod_php) for Laravel services — no Octane/FrankenPHP; Node services run production builds only (dev servers only while editing).
- **Tenant ownership**: Platform Management owns the Tenant entity; IAM is independent — consumes `tenant_id` as an authorization scope only.
- **Refunds & complaints**: Customer Support context owns cases/complaints/refund decisions; Billing executes refund payments; C&RM is interim complaint-intake owner until the CS service exists.
- **Shortfall debt**: Payouts owns accepted remittance shortfalls as deduction adjustments against the agent's payout share.
- **Exposure model**: browser-facing APIs (BFFs + admin APIs + IAM login) are public + JWT-secured; service mesh (datastores, broker, Ollama) has no public route. Documented in INTERNAL_SERVICE_SECURITY.MD.
- **Vector store**: pgvector (reuses PostgreSQL container).
- **Identifiers**: UUIDv7 entities; SQID-masked bigint for transactional records; `JOB-1001`-style codes are display reference numbers only.
- IAM sole JWT issuer (RS256); `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` canonical env vars; `JWT_SECRET` dev fallback; Redis blacklist `jwt:blacklist:<jti>`; `exp`-only validation whenever Redis is unconfigured or unreachable.
- AI is parser/advisor/silent-monitor only — no DB access, no query generation, API-call tools propagate caller JWT; async flows use service identity + on-behalf-of user ID.

## Next Steps

1. Scaffold first service — suggest `serviq-identity-access-backend` (JWT issuance unblocks everything else).
   - **When adding a Dockerfile, uncomment that service's entry in `services/docker-compose.yml` in the same change** — the commented stubs are the implementation checklist (rule also in AGENTS.md).
2. Define Laravel API contracts for payment evidence, remittance, override flows.
3. Decide AI agent deployment shape (one deployment vs per-profile) when implementing.
4. Optional: commit the docs + infra files — everything is still uncommitted.

## Key Files

- [Spec Audit](../specs/AUDIT.MD) — all findings Closed/Fixed
- [docker-compose.yml](../../services/docker-compose.yml) — local stack; app entries commented until Dockerfiles exist
- [Local Resource Budget](../specs/technical/infrastructure/LOCAL_RESOURCE_BUDGET.MD)
- [install.sh](../../scripts/install.sh) — env setup + staged stack bring-up
- [Service Map](../../SERVICE_MAP.md) — rebuilt inventory
- [Internal Service Security](../specs/technical/security/INTERNAL_SERVICE_SECURITY.MD)
- [AI Agent specs](../specs/technical/ai/README.MD)
- [Identifiers](../specs/technical/IDENTIFIERS.MD)
- [Customer Support boundary](../specs/domain/specs/domain_boundaries/service_operations/CUSTOMER_SUPPORT.MD)
- [Project Purpose](../specs/PROJECT_PURPOSE.MD)
