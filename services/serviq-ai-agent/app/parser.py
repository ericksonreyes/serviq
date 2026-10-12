"""Polymorphic document auditor — ADR-0003 boundary.

The AI Agent may ONLY classify and extract. It never decides, settles,
approves, or mutates domain state — parse output goes to Billing, which
owns validation. Every parse carries a confidence + the raw fields the
model saw so the domain can absorb mistakes.
"""
import base64
import json
import os
import re
import urllib.request

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://ollama:11434")
VISION_MODEL = os.environ.get("AI_VISION_MODEL", "moondream")
MODE = os.environ.get("AI_MODEL_MODE", "stub")  # stub | ollama

DOCUMENT_TYPES = [
    "e_wallet_receipt", "cash_photo", "bank_deposit_slip", "remittance_receipt",
    "check", "pos_receipt", "purchase_order", "unknown",
]

SCHEMA_HINTS = {
    "e_wallet_receipt": ["reference_no", "amount", "currency", "sender", "provider"],
    "cash_photo": ["denominations", "total_amount", "currency"],
    "bank_deposit_slip": ["account_no", "amount", "deposit_date", "reference_no"],
    "remittance_receipt": ["provider", "amount", "date", "reference_no"],
    "check": ["check_no", "amount", "bank", "date"],
    "pos_receipt": ["merchant", "amount", "date", "card_last4"],
    "purchase_order": ["po_number", "vendor", "total_amount", "date"],
}

PROMPT = (
    "Classify this document into exactly one of: "
    + ", ".join(DOCUMENT_TYPES)
    + ". Then extract the fields for that type. Respond with JSON only: "
    '{"document_type": "...", "fields": {...}, "confidence": 0.0-1.0}'
)


def _ollama_parse(image_bytes: bytes) -> dict:
    payload = {
        "model": VISION_MODEL,
        "prompt": PROMPT,
        "images": [base64.b64encode(image_bytes).decode()],
        "stream": False,
        "format": "json",
    }
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/generate",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        body = json.loads(res.read())
    return json.loads(body["response"])


def _stub_parse(image_bytes: bytes) -> dict:
    # Deterministic fallback for local dev / evals — keyword heuristic
    # over any embedded text. Real parsing requires the ollama profile.
    text = image_bytes.decode("utf-8", errors="ignore").lower()
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
    return {"document_type": doc_type, "fields": fields, "confidence": 0.4}


def parse_document(image_bytes: bytes) -> dict:
    result = _ollama_parse(image_bytes) if MODE == "ollama" else _stub_parse(image_bytes)
    doc_type = result.get("document_type") or "unknown"
    if doc_type not in DOCUMENT_TYPES:
        doc_type = "unknown"
    fields = result.get("fields") or {}
    return {
        "document_type": doc_type,
        "schema_version": "1",
        "fields": fields,
        "confidence": float(result.get("confidence") or 0.0),
        "model": f"{MODE}:{VISION_MODEL if MODE == 'ollama' else 'heuristic'}",
    }
