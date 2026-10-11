# AI Agent (:8100)

Constrained boundary (ADR-0003): classify `document_type` → extract schema
→ structured JSON. Never decides or mutates — output goes to Billing.
`AI_MODEL_MODE=stub|ollama`, `AI_VISION_MODEL=moondream`, `AI_TEXT_MODEL=qwen2.5:3b`.
Consumer parses `Execution.EvidenceCaptured` photos from MinIO → `AI.PaymentProofParsed`.
`python -m app.eval` runs the 20-doc golden set (stub: type accuracy 1.00).

## Chat — POST /api/v1/chat

JWT-verified (JWKS/public key/HS256 fallback, same rules as every other
service), profile-scoped: `{"profile": "customer|dispatcher|support",
"message": "...", "context": {...}}` → `{"reply", "tool_calls"}`. Multipart
form with a `file` field enables the upload tools. Each profile's tool
whitelist is a hard boundary (AGENT_PROFILES.MD); translation runs on the
Ollama text model with a strict JSON schema and falls back to deterministic
keyword intents, so the endpoint never hard-fails. Tools call the domain
APIs with the caller's JWT forwarded verbatim — the agent never touches a
database and never makes domain decisions.
