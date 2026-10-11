"""JWT verification for inbound chat calls — verify-only, this service
never signs (ADR-0001). Mirrors the Laravel JwtVerifier resolution order
and the shared Redis blacklist posture (JWT_INVALIDATION.MD):

  1. JWT_PUBLIC_KEY (RS256 public key, PEM)
  2. JWKS fetched from IAM (JWT_JWKS_URL)
  3. JWT_SECRET — HS256 symmetric fallback, local/test only

Pure stdlib: no JWT/crypto package is pinned for this service, so RS256
is verified directly (RSASSA-PKCS1-v1_5 is a modular exponentiation over
the public key — no crypto dependency required).
"""
import base64
import hashlib
import hmac
import json
import os
import socket
import time
import urllib.request

ISSUER = os.environ.get("JWT_ISSUER", "serviq-iam")
AUDIENCE = os.environ.get("JWT_AUDIENCE", "serviq")
JWKS_URL = os.environ.get("JWT_JWKS_URL", "http://identity-access-backend/.well-known/jwks.json")

SHA256_DER_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")

_jwks_cache: dict = {"at": 0.0, "keys": {}}
_mode_warned = False


class AuthError(Exception):
    pass


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _der_tlv(data: bytes, i: int) -> tuple[int, bytes, int]:
    tag = data[i]
    i += 1
    length = data[i]
    i += 1
    if length & 0x80:
        n = length & 0x7F
        length = int.from_bytes(data[i:i + n], "big")
        i += n
    return tag, data[i:i + length], i + length


def _spki_to_rsa(pem: str) -> tuple[int, int]:
    """SubjectPublicKeyInfo → (n, e). Minimal DER walk — enough for RSA keys."""
    der = base64.b64decode("".join(line for line in pem.splitlines() if "---" not in line))
    _, spki, _ = _der_tlv(der, 0)
    _, _, i = _der_tlv(spki, 0)          # skip algorithm identifier SEQUENCE
    _, bit_string, _ = _der_tlv(spki, i)
    _, rsa_seq, _ = _der_tlv(bit_string[1:], 0)  # 0x00 pad byte, then RSAPublicKey
    _, n_bytes, j = _der_tlv(rsa_seq, 0)
    _, e_bytes, _ = _der_tlv(rsa_seq, j)
    return int.from_bytes(n_bytes, "big"), int.from_bytes(e_bytes, "big")


def _rs256_verify(n: int, e: int, signing_input: bytes, signature: bytes) -> bool:
    k = (n.bit_length() + 7) // 8
    if len(signature) != k:
        return False
    em = pow(int.from_bytes(signature, "big"), e, n).to_bytes(k, "big")
    digest = hashlib.sha256(signing_input).digest()
    pad_len = k - len(SHA256_DER_PREFIX) - len(digest) - 3
    if pad_len < 8:
        return False
    expected = b"\x00\x01" + b"\xff" * pad_len + b"\x00" + SHA256_DER_PREFIX + digest
    return hmac.compare_digest(em, expected)


def _jwks_key(kid: str | None) -> tuple[int, int] | None:
    if not JWKS_URL:
        return None
    now = time.time()
    if now - _jwks_cache["at"] > 300:
        try:
            with urllib.request.urlopen(JWKS_URL, timeout=5) as res:
                doc = json.loads(res.read())
            _jwks_cache["keys"] = {
                k.get("kid"): (int.from_bytes(_b64url_decode(k["n"]), "big"),
                               int.from_bytes(_b64url_decode(k["e"]), "big"))
                for k in doc.get("keys", []) if k.get("kty") == "RSA"
            }
            _jwks_cache["at"] = now
        except Exception as e:  # noqa: BLE001 — treated as invalid_token upstream
            raise AuthError(f"jwks fetch failed: {e}") from e
    keys = _jwks_cache["keys"]
    if kid and kid in keys:
        return keys[kid]
    return next(iter(keys.values()), None)


def _public_key_pem() -> tuple[int, int] | None:
    pem = os.environ.get("JWT_PUBLIC_KEY", "").replace("\\n", "\n")
    if not pem.strip():
        return None
    try:
        return _spki_to_rsa(pem)
    except Exception as e:  # noqa: BLE001
        raise AuthError(f"JWT_PUBLIC_KEY unreadable: {e}") from e


def _redis_get(key: str) -> bytes | None:
    """Minimal RESP GET for the shared blacklist — no redis package is
    pinned, so speak the protocol directly. Any failure → None (exp-only
    posture, same as the Laravel TokenBlacklist fallback)."""
    host = os.environ.get("REDIS_HOST")
    if not host:
        return None
    port = int(os.environ.get("REDIS_PORT", "6379"))
    try:
        with socket.create_connection((host, port), timeout=2) as sock:
            sock.sendall(f"*2\r\n$3\r\nGET\r\n${len(key)}\r\n{key}\r\n".encode())
            resp = sock.recv(512)
    except OSError:
        return None
    if resp.startswith(b"$-1"):
        return None
    parts = resp.split(b"\r\n")
    return parts[1] if len(parts) > 1 and parts[0].startswith(b"$") else None


def _is_revoked(jti: str | None) -> bool:
    if not jti:
        return False
    try:
        return _redis_get(f"jwt:blacklist:{jti}") is not None
    except Exception:  # noqa: BLE001 — documented exp-only fallback
        return False


def verify_token(token: str) -> dict:
    """Verify signature + registered claims. Returns claims or raises AuthError."""
    global _mode_warned
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        header = json.loads(_b64url_decode(header_b64))
        claims = json.loads(_b64url_decode(payload_b64))
        signature = _b64url_decode(sig_b64)
    except Exception as e:  # noqa: BLE001
        raise AuthError("malformed token") from e

    signing_input = f"{header_b64}.{payload_b64}".encode()
    alg = header.get("alg")

    if alg == "RS256":
        rsa = _public_key_pem() or _jwks_key(header.get("kid"))
        if rsa is None:
            raise AuthError("no RS256 key material configured")
        if not _rs256_verify(rsa[0], rsa[1], signing_input, signature):
            raise AuthError("bad signature")
    elif alg == "HS256":
        secret = os.environ.get("JWT_SECRET")
        if not secret:
            raise AuthError("HS256 token but JWT_SECRET not configured")
        if not _mode_warned:
            _mode_warned = True
            print("[ai-agent] JWT verification resolved to HS256 symmetric fallback "
                  "(JWT_SECRET). Local/test only.", flush=True)
        expected = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            raise AuthError("bad signature")
    else:
        raise AuthError(f"unsupported alg {alg!r}")

    if ISSUER and claims.get("iss") != ISSUER:
        raise AuthError("invalid issuer")
    aud = claims.get("aud")
    if AUDIENCE and (aud != AUDIENCE if isinstance(aud, str) else AUDIENCE not in (aud or [])):
        raise AuthError("invalid audience")
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or exp <= time.time():
        raise AuthError("token expired")
    if not claims.get("sub") or not claims.get("jti"):
        raise AuthError("missing required claims")
    if _is_revoked(claims.get("jti")):
        raise AuthError("token revoked")
    return claims
