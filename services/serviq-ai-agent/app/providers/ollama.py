"""Ollama adapter — local /api/generate (llama.cpp under the hood).

Timeout budget must cover a cold model load: a 3B model takes ~2 min to
map on CPU under the 4g ollama compose cap; shorter timeouts abort the
load server-side.
"""
from .common import b64, post_json


class OllamaText:
    def __init__(self, model: str, base_url: str, timeout: int = 300):
        self.name = f"ollama:{model}"
        self._model = model
        self._url = base_url.rstrip("/") + "/api/generate"
        self._timeout = timeout

    def generate(self, prompt: str) -> str:
        body = post_json(self._url, {
            "model": self._model, "prompt": prompt,
            "stream": False, "format": "json",
        }, timeout=self._timeout)
        return body["response"]


class OllamaVision:
    def __init__(self, model: str, base_url: str, timeout: int = 600):
        self.name = f"ollama:{model}"
        self._model = model
        self._url = base_url.rstrip("/") + "/api/generate"
        # Budget must cover a cold model load plus high-res image tiling
        # on CPU — granite-class models can take 5+ min on small Docker VMs.
        self._timeout = timeout

    def describe(self, prompt: str, image: bytes) -> str:
        body = post_json(self._url, {
            "model": self._model,
            "prompt": prompt,
            "images": [b64(image)],
            "stream": False,
            "format": "json",
            # moondream on CPU runs ~3 t/s and can loop degenerate nested
            # JSON — cap generation so a runaway answer can't outrun the
            # client timeout; truncation is recovered by _extract_json's
            # close-the-brackets salvage.
            "options": {"num_predict": 512},
        }, timeout=self._timeout)
        return body["response"]
