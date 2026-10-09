# ADR-0012: LLM choice is configuration, not architecture — `moondream` default

- Status: Accepted
- Date: 2026-10-10

## Context

The AI Agent needs vision (document/receipt parsing) and text (tool routing/RAG) models on an
8GB machine. Bigger models parse better but compete with the rest of the stack for RAM; the
LLM sits behind an adapter, so the model should be swappable without code changes.

## Decision

Model selection lives in env vars (`OLLAMA_VISION_MODEL`, `OLLAMA_TEXT_MODEL`), not code or
architecture. Defaults for the reference machine: **`moondream` (~1.7GB) vision +
`qwen2.5:3b` (~1.9GB) text**. Documented upgrade ladder when hardware allows:
`qwen2.5vl:3b` (~3GB, better on dense screenshots) → `qwen2.5vl:7b` (`ai`-profile only).
Ollama runs with `KEEP_ALIVE=2m` and `MAX_LOADED_MODELS=1` under a 4GB cap — the AI tier
degrades before it can starve the datastores.

## Alternatives considered

- `qwen2.5vl:3b` as default — more accurate on e-wallet screenshots, but ~2× the footprint;
  kept as the documented upgrade.
- `llama3.2-vision:11b` — ~8GB alone; disqualified.
- PaddleOCR → text-LLM pipeline — deterministic and lighter, but loses layout semantics;
  documented as the last-resort fallback.
- MLX/llama.cpp directly — Apple-native would be more memory-efficient but breaks the
  Docker-first uniformity.

## Consequences

- A demo on bigger hardware (or a managed adapter — Bedrock/Textract) needs an env change,
  not a refactor.
- Accuracy risk is absorbed by domain validation (Billing verifies parsed evidence) and
  measured by an eval set — imperfection is a designed flow, not a hidden bug.
- The reasoning — not just the pick — is part of the portfolio.

See: `technical/infrastructure/LOCAL_RESOURCE_BUDGET.MD`, `PROOF_OF_PAYMENT_OCR_LLM_STACK.MD`;
`.devin/skills/ai-agent-boundary/SKILL.md`.
