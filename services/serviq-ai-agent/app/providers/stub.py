"""Stub provider — deterministic heuristic, no model weights.

Default for local dev / evals / CI: keyword matching over any text
embedded in the payload. Returns JSON through the port like every other
adapter, so it exercises the same _extract_json path."""
import json
import re

from ..documents import DOCUMENT_TYPES, SCHEMA_HINTS


class StubVision:
    name = "stub:heuristic"

    def describe(self, prompt: str, image: bytes) -> str:
        text = image.decode("utf-8", errors="ignore").lower()
        doc_type = "unknown"
        for t in DOCUMENT_TYPES:
            if t != "unknown" and t.replace("_", "") in text.replace("_", ""):
                doc_type = t
                break
        fields = {}
        for key in SCHEMA_HINTS.get(doc_type, []):
            m = re.search(rf"{key}[\":=\s]+([0-9A-Za-z.\-]+)", text)
            if m:
                fields[key] = m.group(1)
        return json.dumps({"document_type": doc_type, "fields": fields,
                           "confidence": 0.4})
