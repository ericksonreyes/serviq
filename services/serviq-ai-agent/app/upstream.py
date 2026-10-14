"""Synchronous upstream calls — every tool forwards the caller's JWT
verbatim (api-security invariant); the downstream service re-validates
scope, roles, and permissions. The agent has no datastore access.
"""
import json
import urllib.error
import urllib.parse
import urllib.request


class UpstreamError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def call(method: str, base_url: str, path: str, token: str,
         query: dict | None = None, body: dict | None = None,
         timeout: int = 15) -> dict:
    url = base_url.rstrip("/") + path
    if query:
        url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None}, doseq=True)
    req = urllib.request.Request(
        url,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        # Read the whole body — Laravel debug errors carry file paths and
        # traces; extracting the message needs the full JSON, and callers
        # must never surface the raw dump.
        detail = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            detail = parsed.get("message") or parsed.get("error") or detail
        except ValueError:
            detail = "unexpected upstream response"
        raise UpstreamError(e.code, str(detail)[:300]) from e
    except urllib.error.URLError as e:
        raise UpstreamError(0, f"upstream unreachable: {e.reason}") from e
