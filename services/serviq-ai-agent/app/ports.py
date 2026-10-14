"""Provider ports — the hexagonal boundary for model backends.

Application code (parser, orchestrator) depends on these Protocols only;
vendor wire formats live in app/providers/*. Both ports return raw model
text — JSON extraction and contract normalization stay in the app layer
so every adapter benefits from the same salvage logic.
"""
from typing import Protocol


class TextModel(Protocol):
    """Single-turn instruct completion used for intent translation."""

    name: str  # provenance stamp, e.g. "ollama:qwen2.5:3b"

    def generate(self, prompt: str) -> str: ...


class VisionModel(Protocol):
    """Image understanding used for document classification/extraction."""

    name: str  # provenance stamp, e.g. "openai:gpt-4o-mini"

    def describe(self, prompt: str, image: bytes) -> str: ...
