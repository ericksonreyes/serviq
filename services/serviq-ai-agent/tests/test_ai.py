"""AI agent unit tests — stdlib unittest, zero deps beyond the service's
own. Covers the contract the whole stack depends on:

- parse_document output shape (document_type/schema_version/fields/
  confidence/model) — the agent-BFF maps these verbatim into Billing
- stub-mode determinism (CI + local dev without model weights)
- chat fallback intent routing (dispatcher profile)

Run inside the image: python -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("AI_MODEL_MODE", "stub")

from app.parser import parse_document  # noqa: E402
from app.orchestrator import _fallback  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
