# ADR-0029: Provider-agnostic model selection — per-capability `AI_<CAP>_PROVIDER`

- Status: Accepted
- Date: 2026-10-15

## Context

ADR-0012 made model choice env configuration with a single `AI_MODEL_MODE` flag
covering one local provider (Ollama). The POC since proved the port absorbs real
cloud vendors: chat and document parsing ran end-to-end on Gemini, and
OpenAI-compatible and Anthropic adapters were added. A single on/off flag can't
express multiple providers or hybrids (e.g. local text + cloud vision).

## Decision

Provider and model selection are per-capability env config: `AI_VISION_*` /
`AI_TEXT_*` over shared `AI_*` defaults. Providers: `stub` | `ollama` | `openai`
(+OpenAI-compatible gateways via `AI_BASE_URL`) | `anthropic` | `gemini`.
Committed defaults are unchanged: **stub in `.env.example`; Ollama `moondream` +
`qwen2.5:3b` as the local live stack** — the no-secrets, fully-Docker default
preserves ADR-0010's "entire stack runs locally" claim. `gemini-3-flash-preview`
is the validated cloud path (free tier); `install.sh` offers the provider choice
on fresh installs and respects existing `.env` config.

## Alternatives considered

- **Gemini as committed default** — requires an API key in env templates, breaking
  the no-secrets install contract and the offline/privacy story; kept as the
  documented and installer-offered option instead.
- **Keep `AI_MODEL_MODE`** — can't express providers, per-capability models, or
  hybrids; retained only as a migration shim resolving `ollama`.
- **Vendor SDKs** — rejected; adapters stay raw HTTPS+JSON so the service pins
  zero LLM dependencies.

## Consequences

- Adding a provider is one `app/providers/<name>.py` + one registry entry — no
  app-code or installer changes (the installer prompts by provider *class*:
  stub / local pull / keyed remote).
- Cloud paths add failure modes stubs don't have (quotas, retired preview model
  ids) — documented in `.env.example`; the runtime stub fallback still applies.
- Anthropic is wire-tested but not live-validated (no free tier); Gemini carries
  the live-proven claim and remains the only zero-cost cloud path.
- Anthropic is also the only provider without a native JSON mode — it relies on
  a system hint plus the app-layer `_extract_json` salvage, validating the
  decision to keep JSON recovery outside the adapters.

Supersedes: ADR-0012 (decision preserved and extended — the `OLLAMA_*_MODEL`
env names and single-flag mechanism are replaced by the per-capability contract;
local defaults and the `qwen2.5vl` upgrade ladder stand).

See: `technical/ai/README.MD`, `services/serviq-ai-agent/.env.example`,
`services/serviq-ai-agent/app/providers/`,
`technical/infrastructure/PROOF_OF_PAYMENT_OCR_LLM_STACK.MD`.
