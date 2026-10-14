"""Composition root — the only module that reads provider configuration.

App code depends on the ports (app.ports), never on vendors. Env contract
per capability (VISION / TEXT), resolved with a two-tier fallback:

  AI_<CAP>_PROVIDER   stub | ollama | openai | gemini
  AI_<CAP>_MODEL      → provider default when unset
  AI_<CAP>_API_KEY    → AI_API_KEY
  AI_<CAP>_BASE_URL   → AI_BASE_URL → provider default
  AI_<CAP>_TIMEOUT    → AI_TIMEOUT → provider default

The shared tier (AI_API_KEY, AI_BASE_URL) covers the common case where
both capabilities use the same vendor; the per-capability tier lets a
hybrid like "local Ollama text + cloud Gemini vision" coexist.

Legacy env kept working during migration: AI_MODEL_MODE=ollama selects
the ollama provider for both capabilities, and OLLAMA_HOST is honored as
an ollama base-url fallback (docker-compose injects it).
"""
import os

from ..ports import TextModel, VisionModel

_PROVIDERS = ("stub", "ollama", "openai", "gemini")
_DEFAULT_BASE = {
    "ollama": "http://ollama:11434",
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com",
}
_DEFAULT_VISION_MODEL = {"ollama": "moondream", "openai": "gpt-4o-mini",
                       "gemini": "gemini-3-flash-preview"}
_DEFAULT_TEXT_MODEL = {"ollama": "qwen2.5:3b", "openai": "gpt-4o-mini",
                     "gemini": "gemini-3-flash-preview"}
_DEFAULT_TIMEOUT = {"ollama": 600, "openai": 120, "gemini": 120}

_UNSET = object()
_cache: dict = {"vision": _UNSET, "text": _UNSET}


def _env(cap: str, key: str, default: str = "") -> str:
    return (os.environ.get(f"AI_{cap}_{key}")
            or os.environ.get(f"AI_{key}")
            or default)


def _provider(cap: str) -> str:
    provider = (os.environ.get(f"AI_{cap}_PROVIDER") or "").lower()
    if provider:
        return provider
    # Migration shim: the old single flag enabled ollama for both
    # capabilities. Remove once all .env files carry AI_*_PROVIDER.
    return "ollama" if os.environ.get("AI_MODEL_MODE") == "ollama" else "stub"


def _base_url(cap: str, provider: str) -> str:
    override = _env(cap, "BASE_URL")
    if override:
        return override
    if provider == "ollama" and os.environ.get("OLLAMA_HOST"):
        return os.environ["OLLAMA_HOST"]  # legacy/compose-injected
    return _DEFAULT_BASE[provider]


def _api_key(cap: str, provider: str) -> str:
    key = _env(cap, "API_KEY")
    if not key:
        raise RuntimeError(
            f"provider {provider!r} requires AI_{cap}_API_KEY or AI_API_KEY")
    return key


def _timeout(cap: str, provider: str) -> int:
    return int(_env(cap, "TIMEOUT", str(_DEFAULT_TIMEOUT.get(provider, 300))))


def build_vision() -> VisionModel:
    provider = _provider("VISION")
    if provider == "stub":
        from .stub import StubVision
        return StubVision()
    if provider not in _PROVIDERS:
        raise RuntimeError(f"unknown AI_VISION_PROVIDER {provider!r} — "
                           f"expected one of {', '.join(_PROVIDERS)}")
    model = _env("VISION", "MODEL", _DEFAULT_VISION_MODEL[provider])
    base = _base_url("VISION", provider)
    timeout = _timeout("VISION", provider)
    if provider == "ollama":
        from .ollama import OllamaVision
        return OllamaVision(model, base, timeout)
    key = _api_key("VISION", provider)
    if provider == "openai":
        from .openai import OpenAIVision
        return OpenAIVision(model, base, key, timeout)
    from .gemini import GeminiVision
    return GeminiVision(model, base, key, timeout)


def build_text() -> TextModel | None:
    """The stub text provider is the keyword/intent fallback inside the
    orchestrator — it doesn't fit the prompt→text port shape, so stub is
    expressed as None and the orchestrator falls through."""
    provider = _provider("TEXT")
    if provider == "stub":
        return None
    if provider not in _PROVIDERS:
        raise RuntimeError(f"unknown AI_TEXT_PROVIDER {provider!r} — "
                           f"expected one of {', '.join(_PROVIDERS)}")
    model = _env("TEXT", "MODEL", _DEFAULT_TEXT_MODEL[provider])
    base = _base_url("TEXT", provider)
    timeout = _timeout("TEXT", provider)
    if provider == "ollama":
        from .ollama import OllamaText
        return OllamaText(model, base, timeout)
    key = _api_key("TEXT", provider)
    if provider == "openai":
        from .openai import OpenAIText
        return OpenAIText(model, base, key, timeout)
    from .gemini import GeminiText
    return GeminiText(model, base, key, timeout)


def vision_model() -> VisionModel:
    """Lazily-built process-wide vision adapter — importing app modules
    never requires provider env, so tests stay on stub defaults."""
    if _cache["vision"] is _UNSET:
        _cache["vision"] = build_vision()
    return _cache["vision"]


def text_model() -> TextModel | None:
    if _cache["text"] is _UNSET:
        _cache["text"] = build_text()
    return _cache["text"]
