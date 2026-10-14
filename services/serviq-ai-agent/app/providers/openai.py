"""OpenAI adapter — /chat/completions with JSON mode.

Also covers OpenAI-compatible endpoints (OpenRouter, Azure-style
gateways, vLLM) by pointing AI_BASE_URL elsewhere.
"""
from .common import b64, post_json, sniff_mime


class OpenAIText:
    def __init__(self, model: str, base_url: str, api_key: str, timeout: int = 120):
        self.name = f"openai:{model}"
        self._model = model
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._timeout = timeout

    def generate(self, prompt: str) -> str:
        body = post_json(self._url, {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
        }, headers=self._headers, timeout=self._timeout)
        return body["choices"][0]["message"]["content"]


class OpenAIVision:
    def __init__(self, model: str, base_url: str, api_key: str, timeout: int = 120):
        self.name = f"openai:{model}"
        self._model = model
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._timeout = timeout

    def describe(self, prompt: str, image: bytes) -> str:
        data_uri = f"data:{sniff_mime(image)};base64,{b64(image)}"
        body = post_json(self._url, {
            "model": self._model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }],
            "response_format": {"type": "json_object"},
        }, headers=self._headers, timeout=self._timeout)
        return body["choices"][0]["message"]["content"]
