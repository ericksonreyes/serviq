"""Anthropic adapter — /v1/messages with x-api-key auth.

Two wire quirks vs the other cloud adapters: max_tokens is mandatory on
every call, and the API has no JSON mode — a system line asks for JSON and
the app layer's salvage extracts it (the same recovery path Ollama uses).
"""
from .common import b64, post_json, sniff_mime

# Mandatory on every request — Anthropic has no "generate until done".
_MAX_TOKENS = 2048
_JSON_SYSTEM = "Respond with a single JSON object — no prose, no markdown fences."


class AnthropicText:
    def __init__(self, model: str, base_url: str, api_key: str, timeout: int = 120):
        self.name = f"anthropic:{model}"
        self._model = model
        self._url = base_url.rstrip("/") + "/v1/messages"
        self._headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
        self._timeout = timeout

    def generate(self, prompt: str) -> str:
        body = post_json(self._url, {
            "model": self._model,
            "max_tokens": _MAX_TOKENS,
            "system": _JSON_SYSTEM,
            "messages": [{"role": "user", "content": prompt}],
        }, headers=self._headers, timeout=self._timeout)
        return _first_text(body)


class AnthropicVision:
    def __init__(self, model: str, base_url: str, api_key: str, timeout: int = 120):
        self.name = f"anthropic:{model}"
        self._model = model
        self._url = base_url.rstrip("/") + "/v1/messages"
        self._headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
        self._timeout = timeout

    def describe(self, prompt: str, image: bytes) -> str:
        body = post_json(self._url, {
            "model": self._model,
            "max_tokens": _MAX_TOKENS,
            "system": _JSON_SYSTEM,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image", "source": {
                    "type": "base64",
                    "media_type": sniff_mime(image),
                    "data": b64(image),
                }},
            ]}],
        }, headers=self._headers, timeout=self._timeout)
        return _first_text(body)


def _first_text(body: dict) -> str:
    """/v1/messages returns a typed content-block list — take the first
    text block (thinking or tool blocks may precede it)."""
    for block in body.get("content") or []:
        if block.get("type") == "text" and block.get("text"):
            return block["text"]
    raise ValueError("anthropic response contained no text block")
