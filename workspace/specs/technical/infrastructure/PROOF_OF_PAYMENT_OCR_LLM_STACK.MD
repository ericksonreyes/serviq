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
