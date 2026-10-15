# AI Agent

This document describes the architecture of the ServIQ AI Agent microservice — a Python + FastAPI service (using an agent framework such as LangChain or CrewAI) that runs context-scoped conversational agents backed by a shared LLM.

## Goals

- Keep LLM inference as shared infrastructure, not duplicated per agent.
- Scope each agent's available tools to the bounded context it serves.
- Enforce authorization through the caller's JWT, not a privileged service token.
- Keep business rules out of the agent; rules belong to tools and the responsible microservices.

## Architecture

```text
Customer / Dispatcher
        │
        ▼
AI Agent microservice (Python + FastAPI)
        │  profile selected per channel
        │
        ├── LLM port ──▶ Ollama (local) / cloud LLM adapter
        ├── Vector search port ──▶ vector store adapter (policies, repair guides)
        └── Tools ──▶ responsible microservices (caller's JWT propagated)
```

- **LLM inference is shared infrastructure.** One inference backend serves all agents — Ollama locally or a managed provider; switching providers is a port/adapter change, consistent with the hexagonal approach used elsewhere.
- **One agent codebase, named agent profiles.** Each profile declares its context, system prompt, and tool registry. The number of running deployments is a separate operational decision — profiles are the isolation mechanism either way.
- **Tools call APIs — never databases.** The agent has no access to PostgreSQL or any other service's datastore. A tool is an API call to the concerned microservice (or an external service), carrying the caller's JWT.

## Model Providers: Stub, Local, and Cloud

Each capability — vision for `/parse`, text for `/chat` — selects a provider via env: `AI_VISION_PROVIDER` / `AI_TEXT_PROVIDER`, with shared `AI_*` vars as the default tier (`stub` | `ollama` | `openai` | `anthropic` | `gemini`). Nothing is loaded in stub mode, so the AI Agent costs zero GPU/RAM overhead when models aren't needed. The per-capability tier also allows hybrids — for example, local Ollama text + cloud Gemini vision.

- **Stub** — deterministic heuristics replace inference. Parsing (`app/parser.py`) keyword-matches the upload's embedded text for a `document_type` and regex-extracts the schema fields, returning a fixed `confidence: 0.4` and `model: "stub:heuristic"`. Chat orchestration (`app/orchestrator.py`) selects tools by keyword/intent matching instead of the text model. Used for local dev without Ollama weights, CI, and the eval suite (`app/eval.py` measures extraction F1 against stubs deliberately).
- **Ollama** — local inference on the shared `infra-ollama` instance (`moondream` vision + `qwen2.5:3b` text, sized for the 8GB reference machine; the `qwen2.5vl` upgrade ladder stays as documented). `/parse` calls the vision model and `/chat` calls the text model; a failed model call falls back to the stub path rather than erroring, so a dead model server degrades gracefully instead of breaking chat.
- **Cloud** — `openai` (also covers OpenAI-compatible endpoints — OpenRouter, vLLM, LiteLLM gateways — by pointing `AI_BASE_URL` at them), `gemini` (live-validated in the POC: chat and document parsing on `gemini-3-flash-preview`), and `anthropic` (implemented and wire-format tested, not live-validated — no free tier). One `AI_API_KEY` plus a provider name swaps the backend.
- **Operator-visible difference** — stub parses return `confidence 0.4`, below Billing's low-confidence threshold, so stub-submitted evidence lands in the manual-review queue by design. To demo the accepted path without models, submit evidence via the API with confidence ≥ 0.6.

Ollama model weights live outside the codebase in the `serviq_ollama-models` volume (kept across fresh installs — re-downloading is GBs). `install.sh` offers the provider choice on fresh installs; without weights the service runs fine in stub mode. The memory budget for live mode is documented in [Local Resource Budget](../infrastructure/LOCAL_RESOURCE_BUDGET.MD#minimum-requirements-measured-2026-10-11). Legacy `AI_MODEL_MODE=ollama` still resolves during migration.

## Security Rules

- The agent propagates the **caller's JWT** to all downstream services. Tenant scoping and role/permission enforcement are identical to a direct API call — the agent cannot exceed the caller's permissions.
- A profile's toolset is a hard boundary: tools not registered to a profile do not exist for that agent, and no tool may be shared between the Customer and Dispatcher profiles.
- Token validation (signature, claims, blacklist check) follows the same rules as every other service — see [Security & Access Control](../security/README.MD).
- Async invocations (for example, queued audio processing over RabbitMQ) cannot carry the caller's live JWT — expiry and revocation make event-carried credentials invalid. Such flows run under a delegation model: the AI service uses its own service identity downstream and records the on-behalf-of user ID for audit. Flows that must act with the caller's permissions stay synchronous.

## The Constraint Principle

Use AI only where deterministic `if/else` logic is too brittle for the input — unstructured, unpredictable, human-generated data. Reaching for an LLM to do CRUD, database queries, or data formatting is a design smell: it wastes compute and latency budget on work that deterministic code does faster and more reliably.

Every AI capability in ServIQ fits one of three constrained roles:

- **Parser** — turn unstructured input (receipts, photos, voice notes) into schema-constrained JSON, then hand it to a service.
- **Advisor** — recommend and explain (e.g. dispatch candidates), never decide; a human approves.
- **Silent monitor** — observe streams (e.g. chat sentiment) and flag for a human; never act on or reply to the user.

The agent is never an **executor** — it does not decide, settle, complete, or mutate state directly.

## What the AI Is Responsible For

The agent's responsibilities are deliberately narrow. It does exactly three things:

- **Document reading and parsing** — extract structured fields from uploaded evidence such as e-wallet receipts, remittance-center receipts, and similar documents; also transcribe field audio reports into structured job data (parts used, labor hours). See [Proof of Payment Parsing](./PROOF_OF_PAYMENT_PARSING.MD).
- **Counting bills and coins** — interpret photos of physical cash and report the denominations and total.
- **Sharing allowed and relevant information** — answer questions by calling tools and reading policies and trusted documentation through the vector search port (RAG).

## Example: Field Report to Invoice

```text
Service Agent records audio in the field and submits
        │
        ▼
BFF / backend validates the JWT and calls the AI service
        │   synchronously, forwarding the caller's JWT
        ▼
AI Agent (FastAPI + Python) transcribes the audio locally
        │
        ▼
Text model structures the transcript → JSON: parts used, labor hours
        │
        ▼
Agent tool calls the Service Job Management API (caller's JWT)
        │   — the service validates and transitions the job
        ▼
Service Job Management emits JobCompleted to the broker
        │
        ▼
Billing (Laravel) consumes the event → invoice + receipt
```

Two things to notice in this flow: the agent never writes to a database — it asks Service Job Management to change state — and Billing learns about completion **from an event**, not from any service watching the database.

## What the AI Cannot Do

- **Make business decisions.** Cancellation eligibility, refund approval, scheduling rules, payment verification — all of these belong to the responsible microservices. When a chat interaction results in an action, the agent calls a tool and the owning service decides the outcome. This keeps the business rules in the domain services where domain-driven design applies and where they remain testable.
- **Generate queries or write to datastores.** Natural-language input is translated into whitelisted tool parameters under a constrained JSON schema — never into SQL or free-form datastore calls. A prompt that cannot be mapped to an allowed tool is rejected, not improvised.
- **Reply autonomously in monitored flows.** Advisory and monitoring capabilities (sentiment triage, dispatch recommendations) surface results to a human operator; they do not message users directly.
- **Use the internet.** Troubleshooting and repair guidance comes only from curated documents ingested into the vector store.
- **Hold policies or state.** The agent does not store policy text, business state, or its own copy of domain data; it retrieves information and delegates actions.

## Related Documentation

- [Agent Profiles](./AGENT_PROFILES.MD) — Customer and Dispatcher chatbot profiles and their tool surfaces
- [Proof of Payment Parsing](./PROOF_OF_PAYMENT_PARSING.MD) — polymorphic document auditor for payment evidence across digital and physical channels
- [Cash Remittance Counting](./CASH_REMITTANCE.MD) — vision-counted cash turn-ins with human-verified variance handling
- [Security & Access Control](../security/README.MD)
- [Identity & Access (IAM)](../security/IDENTITY_AND_ACCESS.MD)
- [JWT Invalidation](../security/JWT_INVALIDATION.MD)
- [Infrastructure & Local Development](../infrastructure/README.MD)
- [Proof of Payment OCR/LLM Stack](../infrastructure/PROOF_OF_PAYMENT_OCR_LLM_STACK.MD)
- [Domain Boundaries](../../domain/specs/DOMAIN_BOUNDARIES.md)
