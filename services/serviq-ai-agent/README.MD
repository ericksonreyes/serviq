# AI Agent (:8100)

Constrained boundary (ADR-0003): classify `document_type` → extract schema
→ structured JSON. Never decides or mutates — output goes to Billing.
`AI_MODEL_MODE=stub|ollama`, `AI_VISION_MODEL=moondream`. Consumer parses
`Execution.EvidenceCaptured` photos from MinIO → `AI.PaymentProofParsed`.
`python -m app.eval` runs the 20-doc golden set (stub: type accuracy 1.00).
