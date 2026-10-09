# Proof of Payment OCR/LLM Stack

This document captures the technical implementation guidance for the Proof of Payment intake pipeline.

The domain behavior remains in the Billing specification. This document focuses on the Dockerized OCR and LLM components that extract structured payment evidence.

## Goals

- Keep the OCR and LLM layers fully isolated in Docker containers.
- Avoid native installs on developer machines.
- Prefer accuracy and machine safety over throughput or model size.
- Keep the stack usable on a MacBook Air M1 with 8GB RAM and 100GB free SSD space.

## Recommended Stack

- **OCR**
  - Local adapter: PaddleOCR
  - Managed adapter: Amazon Textract
- **LLM**
  - Local adapter: llama.cpp with a small quantized instruct model such as Qwen2.5 3B Instruct, Llama 3.2 3B Instruct, or Phi-3 Mini in GGUF format
  - Managed adapter: Amazon Bedrock

These AWS services are listed for comparison only. The local development rule remains Docker-only and does not depend on native installs.

### Vision model candidates (Ollama)

For photo and document parsing — receipts, screenshots, bills and coins — the local Ollama instance can pull multimodal models directly:

- `llama3.2-vision` / `llama3.3-vision` — strong accuracy on complex document structures, tables, and receipts.
- `qwen2.5-vl` / `qwen3-vl` — optimized for reading exact text from mobile UI screenshots and e-wallet formats.
- `deepseek-ocr` / `glm-ocr` — specialized, token-efficient document understanding.

The correct industry terms here are **Vision LLMs** (large multimodal models) or **LLM-powered OCR** — not "ODR". Traditional OCR tools (e.g. Tesseract) scrape text line-by-line and lose layout, which breaks columns and tables. Vision LLMs read the image, perform deep OCR, and preserve semantic layout in one pass — which is why they are preferred for receipts, screenshots, and photographed documents.

These are heavier than the small text-only instruct models above. On the 8GB reference machine, prefer the smallest quantized variant that still parses reliably, and fall back to the PaddleOCR → text-LLM pipeline when a vision model does not fit comfortably.

## Container Layout

- Run OCR and LLM in separate containers.
- Run OCR first, then pass extracted text to the LLM.
- Keep containers stateless where possible.
- Use CPU-only containers unless a future deployment explicitly adds accelerator support.
- Avoid bundling larger models that would pressure the reference machine.

## Reference Machine

For sizing and validation, ServIQ should treat the ideal local development machine as equivalent to a MacBook Air M1 with 8GB RAM and 100GB free SSD space.

On that reference machine, the pipeline should remain usable without depending on native installs, GPU acceleration, or oversized models.

## Integration Notes

- The OCR container emits raw text.
- The LLM container emits structured JSON suitable for the proof-of-payment schema.
- Low-confidence or incomplete parses should still route back to Billing and manual review.
- Final business decisions remain in the domain documentation.
