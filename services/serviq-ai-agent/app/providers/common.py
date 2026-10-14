"""Adapter plumbing — raw urllib, no vendor SDKs (the service pins zero
LLM dependencies; every provider here is plain HTTPS + JSON)."""
import base64
import json
import urllib.request


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def post_json(url: str, payload: dict, headers: dict | None = None,
              timeout: int = 300) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())


def sniff_mime(data: bytes) -> str:
    """Magic-byte sniffing for the image formats adapters actually send.
    parser._normalize_image has already transcoded HEIC-family containers
    to JPEG, so JPEG is the least surprising fallback."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:2] == b"BM":
        return "image/bmp"
    return "image/jpeg"
