# AI Agent (:8100)

Constrained boundary service (ADR-0003): parses documents, counts cash,
and answers profile-scoped chat. It never makes business decisions,
touches a database, or mutates domain state — tools call the owning
microservice's API with the caller's JWT forwarded verbatim.

## What it's for

Field work runs on physical evidence: customers pay through e-wallets
and send screenshots, agents hand in cash at shift end, dispatchers ask
operational questions mid-queue. This service is the AI front-end for
that reality:

- **Document parsing** — a photo of a GCash receipt, bank deposit slip,
  or laid-out bills and coins goes in; a structured
  `{document_type, fields, confidence}` comes out. The AI reports what it
  saw; Billing decides what it means.
- **Cash counting** — a turn-in photo is enumerated per denomination so
  the dispatcher checks a count instead of doing arithmetic.
- **Profile-scoped chat** — customers, dispatchers, and support agents
  get a constrained assistant: natural language in, whitelisted API call
  out. It can look things up and submit records; it cannot approve,
  settle, or decide.

## Surface

| Endpoint / flow | Purpose |
| --- | --- |
| `POST /api/v1/chat` | Profile-scoped agent (`customer` / `dispatcher` / `support`) → `{reply, tool_calls}` |
| `POST /api/v1/parse` | Image → `{document_type, fields, confidence, model}` |
| `GET /api/health` | Resolved adapter names (e.g. `gemini:gemini-3-flash-preview`) |
| `Execution.EvidenceCaptured` | MinIO photo → parse → `AI.PaymentProofParsed` |

## Model providers

Two ports (`app.ports`) — `VisionModel.describe(prompt, image)` for
parsing, `TextModel.generate(prompt)` for intent translation. Adapters in
`app/providers/` are selected by env only.

| Provider | Default vision | Default text | Needs |
| --- | --- | --- | --- |
| `stub` | heuristic | keyword fallback | nothing — CI/dev default |
| `ollama` | `moondream` | `qwen2.5:3b` | `AI_BASE_URL` (`http://ollama:11434`) |
| `openai` | `gpt-4o-mini` | `gpt-4o-mini` | `AI_API_KEY` — also OpenAI-compatible endpoints via `AI_BASE_URL` (OpenRouter, vLLM, LiteLLM) |
| `anthropic` | `claude-haiku-4-5` | `claude-haiku-4-5` | `AI_API_KEY` — wire-tested, not live-validated (no free tier) |
| `gemini` | `gemini-3-flash-preview` | `gemini-3-flash-preview` | `AI_API_KEY` — live-validated; free tier available |

Env contract — full version with per-provider examples in `.env.example`:

- `AI_VISION_PROVIDER`, `AI_TEXT_PROVIDER` — `stub | ollama | openai | anthropic | gemini`
- `AI_VISION_MODEL`, `AI_TEXT_MODEL`, `AI_API_KEY`, `AI_BASE_URL`
- Per-capability overrides for hybrids (e.g. local text + cloud vision):
  `AI_<CAP>_API_KEY`, `AI_<CAP>_BASE_URL`, `AI_<CAP>_TIMEOUT`
- Legacy `AI_MODEL_MODE=ollama` / `OLLAMA_HOST` still resolve during migration

Gemini model names churn: 404 = retired, 503 = saturated. Check
`ListModels` on the key and repoint `AI_*_MODEL` — no code change needed.

## Chat pipeline

`message → intent JSON (whitelisted tool call or reply) → tool → reply`

- Multipart `file` field enables the upload tools (proof of payment,
  remittance evidence, cash turn-in photos).
- Each profile's tool whitelist is a hard boundary (AGENT_PROFILES.MD).
- Intent runs on the text model; failure falls back to deterministic
  keyword intents — a provider outage degrades phrasing coverage, not
  availability.
- Domain vocabulary (riders/drivers/couriers/technicians → service
  agents; bookings/jobs → requests; cases → complaints) is shared by the
  prompt and `orchestrator._fallback` — extend there for new synonyms.

## Layout

```
app/
  ports.py        — TextModel / VisionModel Protocols
  documents.py    — document_type vocabulary + schema hints
  providers/      — composition root (env → adapter) + ollama/openai/anthropic/gemini/stub
  parser.py       — normalize image → vision port → JSON salvage → contract
  orchestrator.py — intent prompt + keyword fallback + tool dispatch
  tools.py        — per-profile tool whitelists over domain APIs
  consumer.py     — EvidenceCaptured → MinIO fetch → parse → AI.PaymentProofParsed
  upstream.py     — JWT-forwarding HTTP client
  auth.py         — JWT verify-only (RS256 / JWKS / HS256)
  eval.py         — golden-set scorer
```

## Ops

| Task | Command |
| --- | --- |
| Tests | `./scripts/test.sh services/serviq-ai-agent` |
| Golden-set eval | `python -m app.eval` inside the image (stub: type accuracy 1.00) |
| Apply `.env` changes | `docker compose -f services/docker-compose.yml up -d ai-agent ai-agent-consumer` — env is baked at creation, `restart` won't pick it up |

## Architecture

ServIQ is a portfolio POC ([PROJECT_PURPOSE](../../workspace/specs/PROJECT_PURPOSE.MD))
— each discipline is demonstrated concretely inside this service:

| Discipline | How it shows up here |
| --- | --- |
| **DDD** | The agent owns no domain state and no business rules — cancellation policy, refund decisions, remittance confirmation all stay in the owning context ([DOMAIN_BOUNDARIES](../../workspace/specs/domain/specs/DOMAIN_BOUNDARIES.md)). Agents, requests, cases, invoices are *foreign* concepts reached via that service's API; per-profile tool whitelists mirror the bounded contexts. |
| **Hexagonal** | Inbound adapters: FastAPI routes (`main.py`), RabbitMQ consumer (`consumer.py`). Application services: `parser.py`, `orchestrator.py` — provider-free. Outbound ports: `app.ports` (`VisionModel`, `TextModel`) → vendor adapters in `app.providers/`; domain APIs via `upstream.py`; MinIO via boto3. One composition root (`providers/__init__.py`) does all env wiring. |
| **SOLID** | OCP — a new provider is one adapter file + one factory case; app code untouched. DIP — `parse_document`/`run_chat` accept injected `Protocol`s, never vendor clients. ISP — two narrow ports instead of one fat LLM interface. SRP — wire format (adapters) vs JSON salvage + contract normalization (`parser`) vs intent + dispatch (`orchestrator`). |
| **Event-driven** | `consumer.py` binds `Execution.EvidenceCaptured` on the `serviq.events` topic exchange with a DLQ, fetches the photo from MinIO, emits `AI.PaymentProofParsed`. Async flow uses service identity + `on_behalf_of` — live JWTs never ride events. No DB → documented exception to the outbox rule: it publishes inline ([ADR-0011](../../workspace/specs/decisions/0011-dedicated-event-consumer-containers.MD)). |
| **Constrained AI** | The model can only emit whitelisted tool calls or plain replies — never free-form actions ([ADR-0003](../../workspace/specs/decisions/0003-constrained-ai-boundary.MD)). Cash counting enumerates denominations but never submits; upload tools hand parsed output to Billing for validation. |
| **Retrieval (RAG-shaped)** | `repair_guide_search` pulls curated repair guides from Service Management's `/repair-guides` API into the tool loop — the agent grounds answers in tenant-curated documents instead of model memory. Served over CRUD today; a vector-search port behind the same tool is the growth path. |

Model selection itself is configuration, not architecture
([ADR-0012](../../workspace/specs/decisions/0012-model-selection-is-configuration.MD))
— that decision is what the ports/adapters split implements.
