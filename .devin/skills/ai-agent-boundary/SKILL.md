---
name: ai-agent-boundary
description: ServIQ AI Agent constraints — what the AI may and may not do, tool/JWT propagation model, approved models, parsing pipeline
allowed-tools:
  - read
  - grep
  - glob
---

Hard boundary rules for anything touching the AI Agent. These are architectural invariants, not suggestions.

## Canonical sources

- `workspace/specs/technical/ai/README.MD` — AI index + identity propagation model
- `workspace/specs/technical/ai/AGENT_PROFILES.MD` — Customer / Dispatcher / Customer Support profiles + tool inventories
- `workspace/specs/technical/ai/PROOF_OF_PAYMENT_PARSING.MD` — polymorphic document auditor
- `workspace/specs/technical/ai/CASH_REMITTANCE.MD` — cash turn-in flow
- `workspace/specs/technical/infrastructure/PROOF_OF_PAYMENT_OCR_LLM_STACK.MD` — model + pipeline rationale

## The boundary

The AI Agent may ONLY: parse documents/images, count bills and coins, and share allowed/relevant information via tools and RAG.

It must NEVER: make business decisions, settle payments, approve refunds, complete jobs, mutate domain state directly, generate SQL, access databases, browse the internet, or reply autonomously in monitored workflows.

## Mechanics

- **No database access, ever.** Tools call the responsible microservice's API; structured parse output is handed to Billing, which owns validation and business decisions.
- **Identity propagation:** synchronous tool calls forward the caller's JWT verbatim. Async flows use service identity + an on-behalf-of user ID — never forward live JWTs over RabbitMQ events.
- **Polymorphic parsing:** classify `document_type` first → extract that type's schema → emit structured JSON. Document types: e-wallet/remittance receipts, cash photos, bank deposit slips, checks, POS receipts, purchase orders.
- **AI mistakes are absorbed by the domain.** Misreads surface as manual-review flags in Billing — design parse output so the domain can always validate it.

## Models (local, Ollama)

- Vision: `moondream` (~1.7GB) default — `qwen2.5vl:3b` (~3GB) is the documented upgrade if screenshot accuracy falls short; `qwen2.5vl:7b` only in `ai`-only profile.
- Text: `qwen2.5:3b` or another ~3B instruct model. Weights live in the `ollama-models` volume; `OLLAMA_KEEP_ALIVE=2m` unloads between calls.
- One vision + one text model pulled at a time — disk conservation rule.
