"""Chat orchestration — AGENT_PROFILES.MD command-bar rules applied to
the conversational surface:

  message → constrained JSON tool call on the profile's whitelist
          → execute tool → compose reply.

The model only ever emits {"tool": <whitelisted name>, "params": {...}}
or {"tool": null, "reply": "..."} — strict schema, current server date
injected, never free-form queries. When Ollama is unavailable (or in
stub mode) a deterministic keyword/intent fallback takes over, so the
endpoint never hard-fails.
"""
import datetime
import json
import os
import re
import urllib.request

from .tools import PROFILE_TOOLS, UUID_RE
from .upstream import UpstreamError

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://ollama:11434")
TEXT_MODEL = os.environ.get("AI_TEXT_MODEL", "qwen2.5:3b")
MODE = os.environ.get("AI_MODEL_MODE", "stub")  # stub | ollama


class ChatError(Exception):
    pass


def _tool_manifest(profile: str) -> str:
    lines = []
    for name, spec in PROFILE_TOOLS[profile].items():
        params = ", ".join(f"{k}: {v}" for k, v in spec["params"].items()) or "none"
        req = f" (required: {', '.join(spec['required'])})" if spec["required"] else ""
        lines.append(f"- {name}: {spec['description']}. Params: {params}{req}")
    return "\n".join(lines)


def _translate_ollama(profile: str, message: str, context: dict, has_file: bool) -> dict:
    """Ask the text model for exactly one whitelisted tool call (or a
    plain reply). Raises on any failure — the caller falls back."""
    today = datetime.date.today().isoformat()
    prompt = (
        f"You are the ServIQ {profile} assistant. Translate the user's message into exactly "
        "one tool call from the whitelist below, or a plain reply when no tool fits.\n"
        f"Current server date: {today}.\n"
        "Rules: only tools from this whitelist exist; never invent tools, params, or values; "
        "copy ids/dates verbatim from the message or context; leave out params you cannot fill.\n"
        f"Tools:\n{_tool_manifest(profile)}\n"
        f"A file is attached: {'yes' if has_file else 'no'}.\n"
        f"Context: {json.dumps(context)}\n"
        "Respond with JSON only, one of:\n"
        '{"tool": "<tool name>", "params": {...}}\n'
        '{"tool": null, "reply": "<helpful answer>"}\n'
        f"Message: {message}"
    )
    payload = {"model": TEXT_MODEL, "prompt": prompt, "stream": False, "format": "json"}
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/generate",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        body = json.loads(res.read())
    return json.loads(body["response"])


def _uuid_from(text: str, context: dict, *keys: str) -> str | None:
    for key in keys:
        value = context.get(key)
        if isinstance(value, str) and UUID_RE.fullmatch(value):
            return value
    match = UUID_RE.search(text or "")
    return match.group(0) if match else None


def _fallback(profile: str, message: str, context: dict, has_file: bool) -> dict:
    """Deterministic keyword/intent mapping — the guaranteed floor when
    the model is unavailable. Unmappable prompts get a hint, not a guess."""
    text = (message or "").lower()
    find_uuid = lambda *keys: _uuid_from(message, context, *keys)  # noqa: E731

    if profile == "customer":
        if has_file:
            return {"tool": "proof_of_payment_upload", "params": {"invoice_id": find_uuid("invoice_id")}}
        if re.search(r"cancel", text):
            return {"tool": "service_request_cancel", "params": {"request_id": find_uuid("request_id")}}
        if re.search(r"status|track|where.*(request|booking)|follow.?up", text):
            return {"tool": "service_request_status", "params": {"request_id": find_uuid("request_id")}}
        if re.search(r"availab|schedulable|open slot|bookable", text):
            return {"tool": "service_availability",
                    "params": {"service_id": find_uuid("service_id"), "date": context.get("date")}}
        if re.search(r"book|schedule|request|appoint|create", text):
            return {"tool": "service_request_create",
                    "params": {"service_id": find_uuid("service_id"), "notes": message}}
        if re.search(r"complain|complaint|report.*(issue|problem)|support case|dissatisfied", text):
            return {"tool": "complaint_file", "params": {"subject": message, "details": message}}
        if re.search(r"refund|money back|reimburs", text):
            return {"tool": "refund_request", "params": {"invoice_id": find_uuid("invoice_id"), "reason": message}}
    elif profile == "dispatcher":
        if has_file:
            if re.search(r"cash|count|turn.?in|bills|coins", text):
                return {"tool": "cash_turnin_count", "params": {"agent_id": find_uuid("agent_id")}}
            return {"tool": "remittance_evidence_upload", "params": {"invoice_id": find_uuid("invoice_id")}}
        if re.search(r"turn.?in|count.*cash|bills.*coins", text):
            return {"tool": "cash_turnin_count", "params": {"agent_id": find_uuid("agent_id")}}
        if re.search(r"remittance|deposit slip|evidence", text):
            return {"tool": "remittance_evidence_upload", "params": {"invoice_id": find_uuid("invoice_id")}}
        if re.search(r"recommend|who.*(assign|dispatch|send)|top.*agent|best.*agent", text):
            return {"tool": "dispatch_recommend", "params": {"job_id": find_uuid("job_id")}}
        if re.search(r"guide|repair|troubleshoot|fix|how to", text):
            return {"tool": "repair_guide_search", "params": {"q": message}}
        if re.search(r"agent|technician|workforce|staff", text) and re.search(r"find|search|available|list|skill|who", text):
            return {"tool": "service_agent_search", "params": {"area": context.get("area"), "status": context.get("status")}}
        if re.search(r"request|queue|job|ticket", text):
            return {"tool": "service_request_search", "params": {"status": context.get("status")}}
    else:  # support
        if re.search(r"refund", text) and re.search(r"execut|process|pay ?out|release", text):
            return {"tool": "refund_process", "params": {"refund_request_id": find_uuid("refund_request_id")}}
        if re.search(r"refund", text) and re.search(r"approv|deny|reject|decide", text):
            return {"tool": "refund_manage",
                    "params": {"action": "decide", "case_id": find_uuid("case_id"),
                               "decision": "approved" if re.search(r"approv", text) else "denied"}}
        if re.search(r"refund", text):
            return {"tool": "refund_manage", "params": {"action": "list", "status": context.get("status")}}
        if re.search(r"escalat", text):
            return {"tool": "complaint_manage", "params": {"action": "status", "status": "escalated",
                                                           "case_id": find_uuid("case_id")}}
        if re.search(r"resolv|close", text):
            return {"tool": "complaint_manage", "params": {"action": "status", "status": "resolved",
                                                           "case_id": find_uuid("case_id")}}
        if re.search(r"note|reply|respond|annotate", text):
            return {"tool": "complaint_manage", "params": {"action": "note", "case_id": find_uuid("case_id"),
                                                           "body": message}}
        if re.search(r"case|complaint|ticket", text):
            return {"tool": "complaint_manage", "params": {"action": "view" if find_uuid("case_id") else "list",
                                                           "case_id": find_uuid("case_id"), "status": context.get("status")}}

    allowed = ", ".join(PROFILE_TOOLS[profile])
    return {"tool": None,
            "reply": f"I can help with: {allowed}. Rephrase your request or give me the missing details "
                     "(e.g. a request or invoice reference)."}


def _translate(profile: str, message: str, context: dict, has_file: bool) -> dict:
    if MODE == "ollama":
        try:
            return _translate_ollama(profile, message, context, has_file)
        except Exception as e:  # noqa: BLE001 — fallback by design
            print(f"[ai-agent] ollama translate failed ({e}) — keyword fallback", flush=True)
    return _fallback(profile, message, context, has_file)


def _error_reply(err: UpstreamError) -> str:
    if err.status in (401, 403):
        return "Your account isn't allowed to do that — check your permissions with the tenant administrator."
    if err.status == 404:
        return "I couldn't find that record — double-check the reference."
    if err.status == 409:
        return f"That action isn't allowed in the record's current state ({err.message})."
    if err.status == 422:
        return f"The request was rejected as invalid ({err.message})."
    if err.status == 0:
        return "The responsible service is unreachable right now — try again shortly."
    return f"The request failed ({err.message})."


def run_chat(profile: str, message: str, context: dict, claims: dict,
             token: str, upload: dict | None) -> dict:
    if profile not in PROFILE_TOOLS:
        raise ChatError(f"unknown profile {profile!r}")

    intent = _translate(profile, message or "", context or {}, bool(upload))
    tool_name = intent.get("tool")
    params = intent.get("params") or {}
    tool_calls: list[dict] = []

    if tool_name is None:
        reply = intent.get("reply") or "How can I help?"
        return {"reply": reply, "tool_calls": tool_calls}

    spec = PROFILE_TOOLS[profile].get(tool_name)
    if spec is None:
        # The model named a tool outside this profile — reject, never improvise.
        allowed = ", ".join(PROFILE_TOOLS[profile])
        return {"reply": f"That action isn't available in this conversation. I can help with: {allowed}.",
                "tool_calls": tool_calls}

    ctx = {"claims": claims, "token": token, "tenant_id": claims.get("tenant_id"),
           "context": context or {}, "message": message or "", "file": upload}
    try:
        result = spec["fn"](ctx, params)
    except UpstreamError as e:
        tool_calls.append({"tool": tool_name, "params": params,
                           "summary": f"upstream error {e.status or 'unreachable'}: {e.message}"})
        return {"reply": _error_reply(e), "tool_calls": tool_calls}
    except Exception as e:  # noqa: BLE001 — never hard-fail the chat
        print(f"[ai-agent] tool {tool_name} failed: {e}", flush=True)
        return {"reply": "Something went wrong running that action — try again shortly.",
                "tool_calls": tool_calls}

    tool_calls.append({"tool": tool_name, "params": params, "summary": result["summary"]})
    return {"reply": result["summary"], "tool_calls": tool_calls}
