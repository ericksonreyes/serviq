# Spec Audit — Contradictions, Orphans, and Technical Risks

Point-in-time audit of `workspace/specs/` (2026-10-09). Each finding lists evidence files, impact, and the agreed
resolution. **Remediation rule:** resolve a finding by editing the referenced specs, then mark it `Closed` here — this
document tracks state; the specs remain canonical.

Status legend: `Open` — not yet fixed in the specs. `Fixed` — the gap is closed by this audit's own edits. `Closed` — resolved in the specs.

## Contradictions

### C1 — Tenant entity ownership claimed by two contexts

- **Evidence:** [IAM spec](technical/security/IDENTITY_AND_ACCESS.MD) ("IAM owns Tenants — registration and identity-side lifecycle"), [Glossary](GLOSSARY.MD) ("owns tenants, users, roles") vs [Platform Management](domain/specs/domain_boundaries/platform/PLATFORM_MANAGEMENT.MD) (owns Tenant, Tenant Lifecycle; creates/activates/suspends tenants) and the [Domain Boundaries](domain/specs/DOMAIN_BOUNDARIES.md) diagram (Tenants under Platform Management).
- **Impact:** two services claiming the same entity breaks per-service data ownership and the "one context owns one thing" rule.
- **Resolution:** Platform Management is the system of record for the Tenant entity (business record, subscription, plan, lifecycle). IAM stays independent — it learns `tenant_id` as an authorization scope (provisioning call or `TenantCreated` event from PM) and owns only users and roles within that scope. Remove IAM's "owns tenants" wording; glossary IAM entry should say "tenant scopes," not "tenants."
- **Status:** Closed — `IDENTITY_AND_ACCESS.MD` now assigns the Tenant entity to Platform Management; IAM consumes `tenant_id` as scope via `TenantCreated`/provisioning. Glossary updated.

### C2 — "Single public edge" contradicts itself and the real exposure model

- **Evidence:** [Service Stacks](technical/SERVICE_STACKS.MD) BFF section says "only the BFF is exposed; internal services stay private and only accept traffic from the BFF," then says "internal admin frontends call their own backends directly" as "trusted-channel applications."
- **Impact:** admin UIs are used by tenant staff over the internet — their APIs cannot be private, and "trusted-channel" wrongly implies network trust replaces authentication.
- **Resolution:** document the corrected model in `security/INTERNAL_SERVICE_SECURITY.MD` (not yet written): browser-facing endpoints are public but require a valid JWT per request; service-mesh internals (PostgreSQL, RabbitMQ, Redis, Ollama, vector store) have no public route; "trusted-channel" wording removed.
- **Status:** Closed — `SERVICE_STACKS.MD` now distinguishes customer edge from audience-internal-but-internet-facing admin APIs; the exposure model is documented in [Internal Service Security](technical/security/INTERNAL_SERVICE_SECURITY.MD).

### C3 — Billing performs its own OCR/LLM intake

- **Evidence:** [Billing](domain/specs/domain_boundaries/finance/BILLING.MD) and [Finance README](domain/specs/domain_boundaries/finance/README.MD) show "OCR Text Extraction → LLM Parsing" inside Billing's boundary, vs [Proof of Payment Parsing](technical/ai/PROOF_OF_PAYMENT_PARSING.MD) where the AI Agent classifies/extracts and calls Billing's API.
- **Impact:** duplicates the parsing capability across a domain service and the AI service; violates "AI parses, domain decides" and pre-dates Vision-LLM terminology.
- **Resolution:** Billing's intake flow starts at "receive structured evidence via API"; the AI Agent does classification and extraction. Update flow text to Vision LLM terminology.
- **Status:** Closed — `BILLING.MD` and `finance/README.MD` now show the AI Agent parsing and Billing receiving structured evidence via API; duplicated intake diagram consolidated.

### C4 — Bank-ledger verification required but excluded

- **Evidence:** [Proof of Payment Parsing](technical/ai/PROOF_OF_PAYMENT_PARSING.MD) says `BANK_SLIP` is "verified against bank ledger before clearing"; [Billing](domain/specs/domain_boundaries/finance/BILLING.MD) lists "direct bank or payment-processor integrations for automatic proof verification" as out of scope.
- **Impact:** an acceptance guardrail depends on an integration the project explicitly excludes.
- **Resolution:** align with the out-of-scope decision — deposit slips get structured-evidence storage plus manual review; no bank-ledger verification. Reword the parsing doc's guardrail column.
- **Status:** Closed — `BANK_SLIP` guardrail now reads "stored as evidence; clearing stays manual review — bank-ledger verification is out of scope."

### C5 — Refund ownership: Customer Support role vs Dispatcher tools

- **Evidence:** [Service Provider persona](domain/specs/personas/SERVICE_PROVIDER.MD) — "Customer Support — can process refunds" — vs [Agent Profiles](technical/ai/AGENT_PROFILES.MD) granting `refund_process`/`refund_manage` to the Dispatcher profile; the [Dispatcher persona](domain/specs/personas/DISPATCHER.MD) never mentions refunds.
- **Impact:** the AI tool surface grants a persona capabilities its own role definition does not.
- **Resolution:** Customer Support owns refunds and complaints (decided). Move refund tools to a Customer Support profile; Dispatcher keeps dispatch-only tools. See C6 for the context consequence.
- **Status:** Closed — `AGENT_PROFILES.MD` now has a Customer Support chatbot owning `refund_process`/`refund_manage`/`complaint_manage`; Dispatcher table is dispatch-only.

### C6 — `complaint_file` has no owning context

- **Evidence:** [Agent Profiles](technical/ai/AGENT_PROFILES.MD) maps `complaint_file` to Customer & Request Management; the [Glossary](GLOSSARY.MD) defines complaints under Customer Support, which [Domain Boundaries](domain/specs/DOMAIN_BOUNDARIES.md) lists only as a *future* bounded context.
- **Impact:** a live tool routes to a context that does not own the capability; the real owner isn't planned yet.
- **Resolution:** Customer Support graduates from the future-context list to a documented boundary owning complaints, cases, escalations, and refunds. Until implemented, C&RM is the documented interim owner for complaint intake — say so explicitly. Repo re-plan must include a Customer Support backend.
- **Status:** Closed — `service_operations/CUSTOMER_SUPPORT.MD` created (owns cases, complaints, escalations, refund decisions; Billing executes refunds), indexed in family READMEs and the DOMAIN_BOUNDARIES responsibilities table; C&RM documented as interim intake owner.

### C7 — Sequential-looking IDs throughout domain docs vs SQID policy

- **Evidence:** `JOB-1001`/`JOB-1025` ([Domain Boundaries](domain/specs/DOMAIN_BOUNDARIES.md)), `REQ-10025`/`JOB-10025` ([Dispatcher Assignment](domain/specs/assignment_strategies/DISPATCHER_ASSIGNMENT.MD)), `Request #REQ-10234` ([Customer persona](domain/specs/personas/CUSTOMER.MD)) vs [Identifiers](technical/IDENTIFIERS.MD): "never expose a predictable sequential ID in a request path, response body, or event payload."
- **Impact:** as written, the canonical examples violate the identifier policy — or an undocumented distinction exists between display reference numbers and record IDs.
- **Resolution:** document the distinction in IDENTIFIERS.MD — human-readable reference numbers (`JOB-1001`) are display labels, not record identifiers; API/event payloads carry SQIDs. Then keep or normalize examples accordingly.
- **Status:** Closed — `IDENTIFIERS.MD` now documents reference numbers as display labels distinct from SQID/UUIDv7 record IDs; glossary gained a Reference Number term.

### C8 — Async AI invocation vs caller-JWT propagation

- **Evidence:** [AI Agent](technical/ai/README.MD) example forwards tasks "via RabbitMQ event or direct call"; the same doc's security rules require propagating the caller's JWT to downstream services.
- **Impact:** async events cannot carry live caller credentials (expiry, revocation); the suggested mechanism contradicts the authorization model.
- **Resolution:** synchronous calls propagate the caller's JWT. Async/event-driven invocation needs a documented delegation model (service identity + recorded on-behalf-of user ID) — or the flow stays synchronous. Specify per flow.
- **Status:** Closed — `ai/README.MD` example is now synchronous JWT forwarding, plus an explicit delegation model for async invocations (service identity + on-behalf-of user ID).

## Orphans and Inconsistencies

### O1 — DOMAIN_BOUNDARIES.md section numbering gap and first-person voice

- Sections jump from 4 to 15 (sections 5–14 were removed); several sections retain draft voice ("I would consider", "I'd define").
- **Resolution:** renumber and normalize voice during the next edit pass on that file.
- **Status:** Closed — sections renumbered 1–11; first-person phrasing normalized across `DOMAIN_BOUNDARIES.md`, `PERSONAS.MD`, and the assignment-strategy docs.

### O2 — Customer-ownership open question already answered elsewhere

- [PERSONAS.MD](domain/specs/PERSONAS.MD) ends with "should Customers belong to a Service Provider, or be global ServIQ identities?" as unresolved; [CUSTOMER.MD](domain/specs/personas/CUSTOMER.MD) already answers: "a signed up customer belongs to a service provider."
- **Resolution:** record the decision in PERSONAS.MD and remove the dangling question.
- **Status:** Closed — PERSONAS.MD now records "customers belong to a Service Provider" as the resolved decision.

### O3 — Dispatcher hierarchy contradiction between persona docs

- [PERSONAS.MD](domain/specs/PERSONAS.MD) diagram shows a linear chain (Tenant Admin → Dispatcher → Service Agents); [SELF_ASSIGNMENT.MD](domain/specs/assignment_strategies/SELF_ASSIGNMENT.MD) explicitly states "the Dispatcher is not necessarily above the Service Agent."
- **Resolution:** fix the PERSONAS diagram to show Dispatcher and Service Agents as peer operational roles under the Service Provider.
- **Status:** Closed — PERSONAS.MD diagram redrawn with Dispatcher and Service Agents as peers.

### O4 — Agent profile tool inventory out of sync

- [AGENT_PROFILES.MD](technical/ai/AGENT_PROFILES.MD): the isolation diagram omits `dispatch_recommend` and `cash_turnin_count`; `proof_of_payment_upload` appears only in prose/diagram notes, not in either profile's tool table.
- **Resolution:** make the tool tables the single inventory; regenerate the diagram from them when refund tools move to Customer Support (C5/C6).
- **Status:** Closed — tool tables now list every tool including `proof_of_payment_upload`/`remittance_evidence_upload`; the diagram shows all three profiles' full inventories.

### O5 — Service Agent Portal channel has no designated service

- The [Glossary](GLOSSARY.MD), [Domain Boundaries](domain/specs/DOMAIN_BOUNDARIES.md), and [SERVICE_AGENT.MD](domain/specs/personas/SERVICE_AGENT.MD) describe a Service Agent Portal channel, but no service or BFF is designated to serve it.
- **Resolution:** decide during the repo re-plan whether agents use a dedicated frontend + which backend edge serves them (own BFF vs direct command APIs).
- **Status:** Closed — decided: dedicated Service Agent frontend (React PWA) behind a dedicated NestJS Service Agent BFF that aggregates and proxies to command APIs (no separate read model).

### O6 — JWKS vs env-var public key wording

- [security/README.MD](technical/security/README.MD) shows "verified against Identity & Access JWKS"; [JWT_SIGNING_KEYS.MD](technical/security/JWT_SIGNING_KEYS.MD) makes the `JWT_PUBLIC_KEY` env var canonical, with JWKS only "if rotation becomes frequent."
- **Resolution:** align the parent doc to "public key (env or optional JWKS endpoint)."
- **Status:** Closed — `security/README.MD` now reads "`JWT_PUBLIC_KEY` env var, or an optional JWKS endpoint on IAM."

### O7 — Empty service inventory is a known mid-replan state

- `SERVICE_MAP.md`'s Services section is empty and `services/` is empty — intentional reset for repo re-planning, not drift.
- **Resolution:** the re-plan must account for: all bounded contexts in [domain_boundaries](domain/specs/domain_boundaries/README.MD), Customer Support (C6), the AI Agent service, the Service Agent channel (O5), and whether Notification needs its own frontend.
- **Status:** Closed — `SERVICE_MAP.md` rebuilt: monorepo folders under `services/`, one frontend per channel (4 apps), one Laravel backend per bounded context (12, including Customer Support), two NestJS BFFs, one FastAPI AI Agent. Notification has no dedicated frontend — its admin views live in the Tenant Console.

### O8 — Context name vs preferred vocabulary

- The context is named "Customer & Request Management" while the [Glossary](GLOSSARY.MD) prefers "Service Request" over "Customer Request."
- **Resolution:** acceptable as a context name; add a glossary note so "Customer & Request Management" is explicitly the approved context name containing Service Requests.
- **Status:** Closed — glossary entry added.

## Technical Risks

### R1 — No object/blob storage port

- Proof-of-payment images, field photos, customer signatures, PO documents, and remittance evidence are uploaded throughout the specs, but no object storage adapter existed.
- **Resolution:** object storage port added to [Infrastructure](technical/infrastructure/README.MD) — MinIO local, S3 managed; services store object keys in PostgreSQL.
- **Status:** Fixed

### R2 — No real-time delivery mechanism

- Broadcast offers, tiered broadcast timeouts, sentiment-flag UI flashes, and live job tracking all need push delivery; no port covered it.
- **Resolution:** real-time delivery port added to [Infrastructure](technical/infrastructure/README.MD) — local WebSocket gateway over Redis pub/sub; managed WebSocket/pub-sub service.
- **Status:** Fixed

### R3 — 8GB reference machine will not fit the full stack

- PostgreSQL + MongoDB + Redis + RabbitMQ + OpenSearch + Fluent Bit + Ollama + a vision LLM + ~12 services exceeds a comfortable 8GB budget, even before model weights.
- **Resolution:** the POC target is the full stack running simultaneously in Docker; tiered local profiles (`infra`/`domain`/`ai`) are documented in [Infrastructure](technical/infrastructure/README.MD) as a fallback lever for memory pressure, not the default. Vision-model sizing already caveated in the [OCR/LLM stack doc](technical/infrastructure/PROOF_OF_PAYMENT_OCR_LLM_STACK.MD).
- **Status:** Closed — `infrastructure/README.MD` now documents tiered local profiles (`infra` / `domain` / `ai`).

### R4 — Standing trade-off: Redis blacklist dependency

- Every authenticated request pays a Redis round-trip; on outage the documented fail-open falls back to `exp`, leaving a revocation window. Documented in [JWT Invalidation](technical/security/JWT_INVALIDATION.MD) — recorded here so it stays visible as a known posture, not a bug.
- **Resolution:** posture finalized — `exp`-only validation whenever Redis is not configured or unreachable, with observability; sensitive operations may still fail closed per endpoint.
- **Status:** Closed — decided and documented in `JWT_INVALIDATION.MD`

## Related Documentation

- [Workspace Specs Index](README.MD)
- [Engineering Disciplines](technical/README.MD)
- [Domain Boundaries](domain/specs/DOMAIN_BOUNDARIES.md)
- [Service Stacks](technical/SERVICE_STACKS.MD)
