"""Gemini adapter — v1beta generateContent with JSON mode."""
from .common import b64, post_json, sniff_mime


class GeminiText:
    def __init__(self, model: str, base_url: str, api_key: str, timeout: int = 120):
        self.name = f"gemini:{model}"
        self._url = (f"{base_url.rstrip('/')}/v1beta/models/"
                     f"{model}:generateContent?key={api_key}")
        self._timeout = timeout

    def generate(self, prompt: str) -> str:
        body = post_json(self._url, {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        }, timeout=self._timeout)
        return _first_text(body)


class GeminiVision:
    def __init__(self, model: str, base_url: str, api_key: str, timeout: int = 120):
        self.name = f"gemini:{model}"
        self._url = (f"{base_url.rstrip('/')}/v1beta/models/"
                     f"{model}:generateContent?key={api_key}")
        self._timeout = timeout

    def describe(self, prompt: str, image: bytes) -> str:
        body = post_json(self._url, {
            "contents": [{"parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": sniff_mime(image), "data": b64(image)}},
            ]}],
            "generationConfig": {"responseMimeType": "application/json"},
        }, timeout=self._timeout)
        return _first_text(body)


def _first_text(body: dict) -> str:
    """Gemini may return several parts (thoughts, then answer) — take the
    first part that carries text."""
    for candidate in body.get("candidates") or []:
        for part in (candidate.get("content") or {}).get("parts") or []:
            if part.get("text"):
                return part["text"]
    raise ValueError("gemini response contained no text part")
