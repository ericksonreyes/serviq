"""AI agent unit tests — stdlib unittest, zero deps beyond the service's
own. Covers the contract the whole stack depends on:

- parse_document output shape (document_type/schema_version/fields/
  confidence/model) — the agent-BFF maps these verbatim into Billing
- stub-mode determinism (CI + local dev without model weights)
- chat fallback intent routing (dispatcher profile)
- provider composition root: env → adapter wiring, plus each adapter's
  wire payload (post_json mocked — no network)

Run inside the image: python -m unittest discover -s tests -v
"""
import contextlib
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("AI_MODEL_MODE", "stub")

from app.parser import parse_document  # noqa: E402
from app.orchestrator import _fallback  # noqa: E402


@contextlib.contextmanager
def _provider_env(**overrides):
    """Snapshot os.environ, strip every AI_*/OLLAMA_HOST var, apply
    overrides — restored on exit (patch.dict rolls back pops too)."""
    with mock.patch.dict(os.environ):
        for key in list(os.environ):
            if key.startswith("AI_") or key == "OLLAMA_HOST":
                os.environ.pop(key)
        os.environ.update(overrides)
        yield


class TestParseContract(unittest.TestCase):
    def test_output_shape(self):
        result = parse_document(b"e_wallet_receipt reference_no: GC-99 amount: 1500.00")
        for key in ("document_type", "schema_version", "fields", "confidence", "model"):
            self.assertIn(key, result)
        self.assertEqual(result["schema_version"], "1")

    def test_stub_mode_marks_model(self):
        result = parse_document(b"cash_photo total_amount: 2000")
        self.assertEqual(result["model"], "stub:heuristic")
        # Stub confidence sits below Billing's 0.6 low-confidence guardrail —
        # stub evidence intentionally routes to manual review.
        self.assertLess(result["confidence"], 0.6)

    def test_document_type_recognition(self):
        for payload, expected in [
            (b"e_wallet_receipt reference_no: GC-1 amount: 100", "e_wallet_receipt"),
            (b"bank_deposit_slip account_no: 123 amount: 5000", "bank_deposit_slip"),
            (b"cash_photo denominations: 500x2 total_amount: 1000", "cash_photo"),
            (b"check check_no: 991 amount: 750 bank: BDO", "check"),
            (b"random noise with no keywords", "unknown"),
        ]:
            with self.subTest(expected=expected):
                self.assertEqual(parse_document(payload)["document_type"], expected)

    def test_field_extraction(self):
        # Stub lowercases the payload before matching — fields land lowercase.
        result = parse_document(b"e_wallet_receipt reference_no: GC-1234 amount: 1500.50 provider: GCash")
        fields = result["fields"]
        self.assertEqual(fields.get("reference_no"), "gc-1234")
        self.assertIn("amount", fields)

    def test_unknown_doc_returns_fixed_stub_confidence(self):
        result = parse_document(b"\x00\x01\x02\x03 binary blob")
        self.assertEqual(result["document_type"], "unknown")
        # Stub always returns 0.4 — low-confidence flags are downstream's job.
        self.assertEqual(result["confidence"], 0.4)


class TestChatFallback(unittest.TestCase):
    def test_fallback_returns_tool_or_reply(self):
        # Fallback returns {"tool", "params"} or {"reply"} — never raises.
        out = _fallback("dispatcher", "assign job to agent", {}, False)
        self.assertTrue(isinstance(out, dict))
        self.assertTrue(("tool" in out and "params" in out) or "reply" in out)

    def test_unknown_profile_rejected_by_run_chat(self):
        # run_chat guards profile membership before fallback/translate —
        # unknown profiles raise ChatError, never improvise.
        from app.orchestrator import run_chat, ChatError
        with self.assertRaises(ChatError):
            run_chat("nonexistent-profile", "hello", {}, {}, "tok", None)


class TestProviderWiring(unittest.TestCase):
    def test_stub_is_the_default(self):
        from app.providers import build_text, build_vision
        from app.providers.stub import StubVision
        with _provider_env():
            self.assertIsInstance(build_vision(), StubVision)
            # Stub text provider = the keyword fallback, expressed as None.
            self.assertIsNone(build_text())

    def test_legacy_model_mode_selects_ollama(self):
        # Migration shim: AI_MODEL_MODE=ollama + OLLAMA_HOST (what the
        # existing .env/compose set) must still resolve to Ollama.
        from app.providers import build_vision
        from app.providers.ollama import OllamaVision
        with _provider_env(AI_MODEL_MODE="ollama", OLLAMA_HOST="http://ollama:11434"):
            vision = build_vision()
            self.assertIsInstance(vision, OllamaVision)
            self.assertEqual(vision.name, "ollama:moondream")

    def test_explicit_provider_model_and_shared_key(self):
        from app.providers import build_vision
        with _provider_env(AI_VISION_PROVIDER="openai", AI_API_KEY="k",
                           AI_VISION_MODEL="gpt-4o"):
            self.assertEqual(build_vision().name, "openai:gpt-4o")

    def test_cloud_provider_requires_a_key(self):
        from app.providers import build_vision
        with _provider_env(AI_VISION_PROVIDER="openai"):
            with self.assertRaises(RuntimeError):
                build_vision()

    def test_unknown_provider_raises(self):
        from app.providers import build_vision
        with _provider_env(AI_VISION_PROVIDER="wat"):
            with self.assertRaises(RuntimeError):
                build_vision()

    def test_hybrid_uses_per_capability_tier(self):
        # Local Ollama text + cloud Gemini vision — the mixed-vendor case
        # the AI_<CAP>_* override tier exists for.
        from app.providers import build_text, build_vision
        with _provider_env(AI_TEXT_PROVIDER="ollama",
                           AI_VISION_PROVIDER="gemini", AI_VISION_API_KEY="vk"):
            self.assertTrue(build_vision().name.startswith("gemini:"))
            self.assertTrue(build_text().name.startswith("ollama:"))


class TestAdapterPayloads(unittest.TestCase):
    def test_ollama_text_posts_generate_json(self):
        from app.providers.ollama import OllamaText
        captured = {}
        def fake(url, payload, headers=None, timeout=None):
            captured.update(url=url, payload=payload)
            return {"response": "{}"}
        with mock.patch("app.providers.ollama.post_json", fake):
            OllamaText("qwen2.5:3b", "http://ollama:11434").generate("hi")
        self.assertEqual(captured["url"], "http://ollama:11434/api/generate")
        self.assertEqual(captured["payload"]["model"], "qwen2.5:3b")
        self.assertEqual(captured["payload"]["format"], "json")

    def test_openai_vision_sends_data_uri_and_bearer(self):
        from app.providers.openai import OpenAIVision
        captured = {}
        def fake(url, payload, headers=None, timeout=None):
            captured.update(url=url, payload=payload, headers=headers)
            return {"choices": [{"message": {"content": "{}"}}]}
        with mock.patch("app.providers.openai.post_json", fake):
            OpenAIVision("gpt-4o-mini", "https://api.openai.com/v1", "k").describe(
                "p", b"\xff\xd8\xffjpeg-bytes")
        content = captured["payload"]["messages"][0]["content"]
        self.assertTrue(content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(captured["headers"]["Authorization"], "Bearer k")
        self.assertEqual(captured["payload"]["response_format"], {"type": "json_object"})

    def test_gemini_extracts_first_text_part(self):
        from app.providers.gemini import GeminiText
        def fake(url, payload, headers=None, timeout=None):
            return {"candidates": [{"content": {"parts": [{"text": '{"a": 1}'}]}}]}
        with mock.patch("app.providers.gemini.post_json", fake):
            out = GeminiText("gemini-3-flash-preview", "https://generativelanguage.googleapis.com", "k").generate("p")
        self.assertEqual(out, '{"a": 1}')

    def test_stub_vision_emits_json_through_the_port(self):
        import json as _json
        from app.providers.stub import StubVision
        out = _json.loads(StubVision().describe("p", b"check check_no: 9 amount: 5"))
        self.assertEqual(out["document_type"], "check")


if __name__ == "__main__":
    unittest.main()
