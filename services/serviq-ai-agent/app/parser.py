"""Polymorphic document auditor — ADR-0003 boundary.

The AI Agent may ONLY classify and extract. It never decides, settles,
approves, or mutates domain state — parse output goes to Billing, which
owns validation. Every parse carries a confidence + the raw fields the
model saw so the domain can absorb mistakes.

The vision backend is an injected VisionModel port (app.ports) — the
pipeline below is provider-agnostic; vendor adapters live in
app.providers.
"""
import io
import json
import re

from .documents import DOCUMENT_TYPES
from .ports import VisionModel

PROMPT = (
    "Classify this document into exactly one of: "
    + ", ".join(DOCUMENT_TYPES)
    + ". Then extract the fields for that type. All currency is Philippine "
    "Peso (PHP, ₱) — bills are ₱20, ₱50, ₱100, ₱200, ₱500, ₱1000 and coins "
    "are ₱1, ₱5, ₱10, ₱20. For a cash_photo, enumerate what you see — one "
    'entry per visible coin or bill in "denominations": '
    '[{"denomination": <face value>}]. Do not estimate or total — list only '
    'items actually visible. Respond with JSON only: '
    '{"document_type": "...", "fields": {...}, "confidence": 0.0-1.0}'
)


def _normalize_image(image_bytes: bytes) -> bytes:
    """Transcode HEIF-family containers (HEIC from iPhones, AVIF) to JPEG —
    vision backends are JPEG/PNG-class only in practice (llama.cpp's clip
    encoder 400s on HEIC; cloud APIs accept it inconsistently). Lazily
    imports pillow so the stub path and test envs carry no image
    dependency; undecodable input passes through unchanged so the
    upstream error stays honest."""
    heif_brands = (b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"avif")
    if len(image_bytes) < 12 or image_bytes[4:8] != b"ftyp" or image_bytes[8:12] not in heif_brands:
        return image_bytes
    try:
        import pillow_heif
        from PIL import Image

        pillow_heif.register_heif_opener()
        img = Image.open(io.BytesIO(image_bytes))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=90)
        return buf.getvalue()
    except Exception:
        return image_bytes


def _closers(text: str) -> str:
    stack = []
    in_str = esc = False
    for c in text:
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c in "{[":
            stack.append(c)
        elif c in "}]":
            if stack:
                stack.pop()
    return ('"' if in_str else "") + "".join("}" if b == "{" else "]" for b in reversed(stack))


def _extract_json(text: str):
    """Small vision models routinely emit fenced, wrapped, or truncated
    JSON despite JSON mode. Try raw → strip fence → balanced span →
    progressively trim the tail and close open containers."""
    t = re.sub(r"^```(?:json)?\s*", "", text.strip())
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    starts = [i for i in (t.find("{"), t.find("[")) if i >= 0]
    if not starts:
        raise ValueError("model response contained no JSON")
    start = min(starts)
    for end in range(len(t), start, -1):
        piece = t[start:end].rstrip(",: \t\n")
        if not piece:
            continue
        try:
            return json.loads(piece + _closers(piece))
        except (json.JSONDecodeError, ValueError):
            continue
    raise ValueError("model response JSON unrecoverable")


def parse_document(image_bytes: bytes, vision: VisionModel | None = None) -> dict:
    """Classify → extract → normalize. `vision` is injectable for tests;
    when omitted it resolves to the env-configured provider."""
    if vision is None:
        from .providers import vision_model
        vision = vision_model()
    raw = vision.describe(PROMPT, _normalize_image(image_bytes))
    try:
        result = _extract_json(raw)
    except ValueError:
        print(f"[ai-agent] unparseable vision output ({vision.name}): {raw[:160]!r}", flush=True)
        result = {}
    # Vision models may wrap the object in an array despite JSON mode —
    # take the first object if so; a bare scalar/list-of-nothing is unusable.
    if isinstance(result, list):
        result = next((r for r in result if isinstance(r, dict)), {})
    if not isinstance(result, dict):
        result = {}
    doc_type = result.get("document_type") or "unknown"
    if doc_type not in DOCUMENT_TYPES:
        doc_type = "unknown"
    fields = result.get("fields") or {}
    # Cash photos naturally produce a denomination table — models emit it
    # as a list of {denomination, count} rows. Keep it under the hinted key
    # so the counting tool can sum it instead of crashing on a bare list.
    if isinstance(fields, list):
        fields = {"denominations" if doc_type == "cash_photo" else "items": fields}
    if not isinstance(fields, dict):
        fields = {}
    return {
        "document_type": doc_type,
        "schema_version": "1",
        "fields": fields,
        "confidence": float(result.get("confidence") or 0.0),
        "model": vision.name,
    }
