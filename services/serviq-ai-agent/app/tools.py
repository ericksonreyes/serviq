"""Profile tool registries — AGENT_PROFILES.MD is the contract.

Profile isolation is a hard boundary: a tool not registered to a profile
does not exist for that agent, and profiles never share a tool. Each tool
is a thin adapter over the owning microservice's API — the caller's JWT
is forwarded verbatim and every business decision (cancellation policy,
refund approval, remittance confirmation) stays in the domain service.
"""
import json
import os
import re

from .parser import parse_document
from .upstream import call

SERVICE_MGMT_URL = os.environ.get("SERVICE_MGMT_URL", "http://service-management-backend")
CRM_URL = os.environ.get("CRM_URL", "http://customer-request-backend")
WORKFORCE_URL = os.environ.get("WORKFORCE_URL", "http://workforce-backend")
DISPATCH_URL = os.environ.get("DISPATCH_URL", "http://assignment-dispatch-backend")
SUPPORT_URL = os.environ.get("SUPPORT_URL", "http://customer-support-backend")
BILLING_URL = os.environ.get("BILLING_URL", "http://billing-backend")

# Parser document types → Billing PaymentEvidence.TYPES (BILLING.MD).
DOC_TYPE_MAP = {
    "e_wallet_receipt": "E_WALLET",
    "bank_deposit_slip": "BANK_SLIP",
    "remittance_receipt": "REMITTANCE_RECEIPT",
    "check": "BANK_CHECK",
    "pos_receipt": "POS_RECEIPT",
    "purchase_order": "PURCHASE_ORDER",
    "cash_photo": "CASH_PHOTO",
}

UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


def _amount_cents(fields: dict) -> int:
    raw = fields.get("amount") or fields.get("total_amount") or fields.get("deposited_amount") or "0"
    try:
        return int(round(float(str(raw).replace(",", "")) * 100))
    except (TypeError, ValueError):
        return 0


def _reference(fields: dict) -> str | None:
    for key in ("reference_no", "reference", "check_no", "po_number", "reference_id"):
        if fields.get(key):
            return str(fields[key])
    return None


def _paid_at(fields: dict) -> str | None:
    for key in ("paid_at", "deposit_date", "date"):
        if fields.get(key):
            return str(fields[key])
    return None


def _submit_evidence(ctx: dict, params: dict, label: str) -> dict:
    """Shared parse → Billing intake for both upload tools (each profile
    registers its own tool — this helper is plumbing, not a shared tool)."""
    upload = ctx.get("file")
    if not upload or not upload.get("content"):
        return {"summary": f"No file attached — attach the {label} image and try again."}
    parsed = parse_document(upload["content"])
    doc_type = DOC_TYPE_MAP.get(parsed["document_type"])
    if doc_type is None:
        # Never invent values: unparseable uploads go to manual review.
        return {"summary": "I couldn't identify the document type in that image. "
                           "Please retake the photo clearly or hand it to staff for manual review.",
                    "data": {"parsed": parsed}}
    fields = parsed.get("fields") or {}
    body = {
        "document_type": doc_type,
        "file_ref": f"chat-upload:{upload.get('filename') or 'attachment'}",
        "raw_text": json.dumps(fields),
        "confidence": parsed.get("confidence"),
        "extracted": {
            "reference": _reference(fields),
            "amount_cents": _amount_cents(fields),
            "channel": fields.get("provider") or fields.get("channel"),
            "payer_name": fields.get("sender") or fields.get("payer_name") or fields.get("vendor"),
            "paid_at": _paid_at(fields),
        },
    }
    invoice_id = params.get("invoice_id") or ctx["context"].get("invoice_id")
    if invoice_id:
        body["invoice_id"] = invoice_id
    res = call("POST", BILLING_URL, f"/api/v1/tenants/{ctx['tenant_id']}/payment-evidence",
               ctx["token"], body=body)
    row = res.get("data") or {}
    status = row.get("status", "recorded")
    flags = row.get("flags") or []
    note = f" Flagged for review ({', '.join(flags)})." if flags else ""
    return {"summary": f"{label} parsed as {doc_type} and submitted to Billing — status: {status}.{note}",
            "data": {"parsed": parsed, "evidence": row}}


# ── Customer profile ─────────────────────────────────────────────────

def service_availability(ctx, params):
    service_id = params.get("service_id") or ctx["context"].get("service_id")
    if not service_id:
        return {"summary": "Which service would you like to check? I need a service to look up availability."}
    query = {"from": params.get("from") or params.get("date"),
             "to": params.get("to") or params.get("date")}
    res = call("GET", SERVICE_MGMT_URL,
               f"/api/v1/tenants/{ctx['tenant_id']}/services/{service_id}/availability",
               ctx["token"], query=query)
    days = res.get("data") or []
    if not days:
        return {"summary": "No bookable capacity in that date range."}
    listing = ", ".join(f"{d['date']} ({d['slots']} slot{'s' if d['slots'] != 1 else ''})" for d in days[:7])
    return {"summary": f"Available: {listing}", "data": days}


def service_request_status(ctx, params):
    request_id = params.get("request_id") or ctx["context"].get("request_id")
    if request_id:
        res = call("GET", CRM_URL, f"/api/v1/tenants/{ctx['tenant_id']}/requests/{request_id}", ctx["token"])
        row = res.get("data") or {}
        return {"summary": f"Request {row.get('id', request_id)} is currently '{row.get('status', 'unknown')}'.",
                "data": row}
    res = call("GET", CRM_URL, f"/api/v1/tenants/{ctx['tenant_id']}/requests",
               ctx["token"], query={"status": params.get("status"), "customer_id": ctx["context"].get("customer_id")})
    rows = (res.get("data") or [])[:5]
    if not rows:
        return {"summary": "I couldn't find any service requests on your account."}
    listing = "; ".join(f"{r.get('id')} → {r.get('status')}" for r in rows)
    return {"summary": f"Your recent requests: {listing}", "data": rows}


def service_request_create(ctx, params):
    customer_id = ctx["context"].get("customer_id")
    if not customer_id:
        who = ctx["claims"].get("sub")
        resolved = call("GET", CRM_URL,
                        f"/api/v1/tenants/{ctx['tenant_id']}/customers/by-user/{who}", ctx["token"])
        customer_id = (resolved.get("data") or {}).get("id")
    if not customer_id:
        return {"summary": "I couldn't find a customer profile for your account — please complete your profile first."}
    body = {
        "tenant_id": ctx["tenant_id"],
        "customer_id": customer_id,
        "service_id": params.get("service_id") or ctx["context"].get("service_id"),
        "preferred_date": params.get("preferred_date") or params.get("date"),
        "scheduled_for": params.get("scheduled_for"),
        "address_id": params.get("address_id"),
        "address": params.get("address"),
        "notes": params.get("notes") or ctx["message"],
        "details": params.get("details") or {"notes": ctx["message"]},
    }
    res = call("POST", CRM_URL, "/api/v1/requests", ctx["token"], body={k: v for k, v in body.items() if v is not None})
    row = res.get("data") or {}
    return {"summary": f"Service request created — reference {row.get('id', 'submitted')}, status '{row.get('status', 'submitted')}'.",
            "data": row}


def service_request_cancel(ctx, params):
    request_id = params.get("request_id") or ctx["context"].get("request_id")
    if not request_id:
        return {"summary": "Which request should I cancel? Give me the request reference."}
    # Cancellation policy is evaluated by Customer & Request Management —
    # the agent never decides eligibility.
    res = call("POST", CRM_URL, f"/api/v1/tenants/{ctx['tenant_id']}/requests/{request_id}/cancel", ctx["token"], body={})
    row = res.get("data") or {}
    return {"summary": f"Request {request_id} cancelled — status '{row.get('status', 'cancelled')}'.", "data": row}


def complaint_file(ctx, params):
    subject = params.get("subject") or (ctx["message"][:120] if ctx.get("message") else None)
    if not subject:
        return {"summary": "Tell me briefly what the complaint is about."}
    body = {
        "subject": subject,
        "details": params.get("details") or ctx.get("message"),
        "job_id": params.get("job_id"),
        "invoice_id": params.get("invoice_id"),
        "customer_id": params.get("customer_id") or ctx["context"].get("customer_id"),
    }
    res = call("POST", SUPPORT_URL, "/api/v1/cases", ctx["token"], body={k: v for k, v in body.items() if v is not None})
    row = res.get("data") or {}
    return {"summary": f"Support case filed — reference {row.get('id', 'created')}. Our team will follow up.", "data": row}


def proof_of_payment_upload(ctx, params):
    return _submit_evidence(ctx, params, "proof of payment")


def refund_request(ctx, params):
    invoice_id = params.get("invoice_id") or ctx["context"].get("invoice_id")
    if not invoice_id:
        return {"summary": "Which invoice should the refund cover? Give me the invoice reference."}
    body = {"invoice_id": invoice_id, "reason": params.get("reason") or ctx.get("message")}
    res = call("POST", BILLING_URL, f"/api/v1/tenants/{ctx['tenant_id']}/refund-requests", ctx["token"], body=body)
    row = res.get("data") or {}
    return {"summary": f"Refund request submitted — status '{row.get('status', 'pending')}'. A support agent will review it.",
            "data": row}


# ── Dispatcher profile ───────────────────────────────────────────────

def service_request_search(ctx, params):
    res = call("GET", CRM_URL, f"/api/v1/tenants/{ctx['tenant_id']}/requests",
               ctx["token"], query={"status": params.get("status"), "customer_id": params.get("customer_id")})
    rows = (res.get("data") or [])[:10]
    if not rows:
        return {"summary": "No requests matched."}
    listing = "; ".join(f"{r.get('id')} → {r.get('status')}" for r in rows)
    return {"summary": f"{len(rows)} request(s): {listing}", "data": rows}


def service_agent_search(ctx, params):
    if params.get("skills") or params.get("area"):
        query = {"area": params.get("area")}
        for i, skill in enumerate(params.get("skills") or []):
            query[f"skills[{i}]"] = skill
        res = call("GET", WORKFORCE_URL, f"/api/v1/tenants/{ctx['tenant_id']}/agents/eligible",
                   ctx["token"], query=query)
    else:
        res = call("GET", WORKFORCE_URL, f"/api/v1/tenants/{ctx['tenant_id']}/agents",
                   ctx["token"], query={"status": params.get("status") or "active"})
    rows = (res.get("data") or [])[:10]
    if not rows:
        return {"summary": "No agents matched."}
    listing = "; ".join(f"{a.get('name')} ({a.get('status')})" for a in rows)
    return {"summary": f"{len(rows)} agent(s): {listing}", "data": rows}


def repair_guide_search(ctx, params):
    q = params.get("q") or params.get("query") or ctx.get("message")
    res = call("GET", SERVICE_MGMT_URL, f"/api/v1/tenants/{ctx['tenant_id']}/repair-guides",
               ctx["token"], query={"q": q})
    rows = (res.get("data") or [])[:5]
    if not rows:
        return {"summary": "No curated repair guides matched that query."}
    listing = "; ".join(g.get("title", "untitled") for g in rows)
    return {"summary": f"Guides found: {listing}", "data": rows}


def dispatch_recommend(ctx, params):
    job_id = params.get("job_id") or ctx["context"].get("job_id")
    if not job_id:
        return {"summary": "Which job should I rank agents for? Give me the job id."}
    # Advisory only — Assignment & Dispatch performs the actual assignment.
    res = call("GET", DISPATCH_URL, f"/api/v1/tenants/{ctx['tenant_id']}/dispatch/recommend",
               ctx["token"], query={"job_id": job_id})
    rows = (res.get("data") or [])[:5]
    if not rows:
        return {"summary": "No candidate agents for that job right now."}
    listing = "; ".join(f"{r.get('name')} (score {r.get('score')}) — {', '.join(r.get('reasons') or [])}" for r in rows)
    return {"summary": f"Recommendations: {listing}", "data": rows}


def cash_turnin_count(ctx, params):
    upload = ctx.get("file")
    agent_id = params.get("agent_id") or ctx["context"].get("agent_id")
    if not agent_id:
        return {"summary": "Which agent is turning in? Give me the agent id."}
    if not upload or not upload.get("content"):
        return {"summary": "Attach the photo of the laid-out bills and coins."}
    # The AI only counts — Billing owns expected-vs-counted reconciliation.
    parsed = parse_document(upload["content"])
    fields = parsed.get("fields") or {}
    counted = _amount_cents(fields)
    if counted <= 0:
        return {"summary": "I couldn't read a countable total from that photo — retake it or count manually.",
                "data": {"parsed": parsed}}
    body = {"agent_id": agent_id, "counted_total_cents": counted,
            "breakdown": fields.get("denominations") or fields}
    res = call("POST", BILLING_URL, f"/api/v1/tenants/{ctx['tenant_id']}/remittances/turn-ins",
               ctx["token"], body=body)
    row = res.get("data") or {}
    return {"summary": f"Counted {counted / 100:.2f} and submitted the turn-in — status '{row.get('status', 'pending')}'.",
            "data": {"parsed": parsed, "remittance": row}}


def remittance_evidence_upload(ctx, params):
    return _submit_evidence(ctx, params, "remittance evidence")


# ── Customer Support profile ─────────────────────────────────────────

def complaint_manage(ctx, params):
    action = params.get("action") or "list"
    tenant = ctx["tenant_id"]
    case_id = params.get("case_id") or ctx["context"].get("case_id")
    if action == "list":
        res = call("GET", SUPPORT_URL, f"/api/v1/tenants/{tenant}/cases",
                   ctx["token"], query={"status": params.get("status")})
        rows = (res.get("data") or [])[:10]
        if not rows:
            return {"summary": "No cases matched."}
        listing = "; ".join(f"{c.get('id')} [{c.get('status')}] {c.get('subject')}" for c in rows)
        return {"summary": f"{len(rows)} case(s): {listing}", "data": rows}
    if not case_id:
        return {"summary": "Which case? Give me the case id."}
    if action == "view":
        res = call("GET", SUPPORT_URL, f"/api/v1/tenants/{tenant}/cases/{case_id}", ctx["token"])
        row = res.get("data") or {}
        return {"summary": f"Case {case_id}: [{row.get('status')}] {row.get('subject')} — {row.get('details') or ''}",
                "data": row}
    if action == "note":
        body_text = params.get("body") or ctx.get("message")
        res = call("POST", SUPPORT_URL, f"/api/v1/tenants/{tenant}/cases/{case_id}/notes",
                   ctx["token"], body={"body": body_text})
        return {"summary": f"Note added to case {case_id}.", "data": res.get("data")}
    if action == "status":
        status = params.get("status")
        if status not in ("open", "in_progress", "escalated", "resolved"):
            return {"summary": "Status must be one of: open, in_progress, escalated, resolved."}
        res = call("POST", SUPPORT_URL, f"/api/v1/tenants/{tenant}/cases/{case_id}/status",
                   ctx["token"], body={"status": status})
        return {"summary": f"Case {case_id} moved to '{status}'.", "data": res.get("data")}
    return {"summary": "Action must be one of: list, view, note, status."}


def refund_process(ctx, params):
    refund_request_id = params.get("refund_request_id") or params.get("id") or ctx["context"].get("refund_request_id")
    if not refund_request_id:
        return {"summary": "Which refund request should I execute? Give me its id."}
    # Permission-gated upstream — Billing only executes approved refunds.
    res = call("POST", BILLING_URL,
               f"/api/v1/tenants/{ctx['tenant_id']}/refund-requests/{refund_request_id}/execute",
               ctx["token"], body={})
    row = res.get("data") or {}
    return {"summary": f"Refund {refund_request_id} executed — status '{row.get('status', 'done')}'.", "data": row}


def refund_manage(ctx, params):
    action = params.get("action") or "list"
    tenant = ctx["tenant_id"]
    if action == "list":
        pending = call("GET", BILLING_URL, f"/api/v1/tenants/{tenant}/refund-requests",
                       ctx["token"], query={"status": params.get("status")})
        rows = (pending.get("data") or [])[:10]
        if not rows:
            return {"summary": "No refund requests in the queue."}
        listing = "; ".join(f"{r.get('id')} [{r.get('status')}] invoice {r.get('invoice_id')}" for r in rows)
        return {"summary": f"{len(rows)} refund request(s): {listing}", "data": rows}
    if action == "decisions":
        res = call("GET", SUPPORT_URL, f"/api/v1/tenants/{tenant}/refund-decisions", ctx["token"])
        rows = (res.get("data") or [])[:10]
        listing = "; ".join(f"{d.get('id')} [{d.get('decision')}] case {d.get('case_id')}" for d in rows)
        return {"summary": f"{len(rows)} decision(s): {listing}" if rows else "No refund decisions recorded.",
                "data": rows}
    if action == "decide":
        case_id = params.get("case_id") or ctx["context"].get("case_id")
        decision = params.get("decision")
        if not case_id or decision not in ("approved", "denied"):
            return {"summary": "To decide a refund I need the case id and decision (approved|denied)."}
        body = {"decision": decision, "amount_cents": params.get("amount_cents"), "reason": params.get("reason")}
        res = call("POST", SUPPORT_URL, f"/api/v1/tenants/{tenant}/cases/{case_id}/refund-decision",
                   ctx["token"], body={k: v for k, v in body.items() if v is not None})
        row = res.get("data") or {}
        return {"summary": f"Refund decision '{decision}' recorded on case {case_id}.", "data": row}
    return {"summary": "Action must be one of: list, decisions, decide."}


def _t(description, params, required, fn):
    return {"description": description, "params": params, "required": required, "fn": fn}


PROFILE_TOOLS = {
    "customer": {
        "service_availability": _t(
            "Check whether a service can be scheduled on a date or date range",
            {"service_id": "uuid (required)", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "date": "YYYY-MM-DD single-day shortcut"},
            ["service_id"], service_availability),
        "service_request_status": _t(
            "Look up the status of the caller's own service request",
            {"request_id": "uuid (optional; omit to list recent)", "status": "filter"},
            [], service_request_status),
        "service_request_create": _t(
            "Create a new service request for the caller",
            {"service_id": "uuid", "preferred_date": "YYYY-MM-DD", "scheduled_for": "ISO datetime",
             "address_id": "uuid", "address": "string", "notes": "string"},
            [], service_request_create),
        "service_request_cancel": _t(
            "Cancel one of the caller's service requests (policy-gated upstream)",
            {"request_id": "uuid"}, ["request_id"], service_request_cancel),
        "complaint_file": _t(
            "File a complaint or support case",
            {"subject": "short summary", "details": "text", "job_id": "uuid", "invoice_id": "uuid"},
            ["subject"], complaint_file),
        "proof_of_payment_upload": _t(
            "Submit payment evidence (receipt/slip image attached to the chat) for AI parsing and storage",
            {"invoice_id": "uuid (optional)"}, [], proof_of_payment_upload),
        "refund_request": _t(
            "Request a refund on an invoice",
            {"invoice_id": "uuid", "reason": "text"}, ["invoice_id"], refund_request),
    },
    "dispatcher": {
        "service_request_search": _t(
            "Search service requests across the tenant queue",
            {"status": "submitted|reviewed|converted|cancelled", "customer_id": "uuid"},
            [], service_request_search),
        "service_agent_search": _t(
            "Find service agents by skill, availability, or service area",
            {"status": "active|inactive", "skills": ["skill"], "area": "service area name"},
            [], service_agent_search),
        "repair_guide_search": _t(
            "Search curated troubleshooting and repair guides",
            {"q": "search text"}, ["q"], repair_guide_search),
        "dispatch_recommend": _t(
            "Advisory top-N agent recommendations for a job, with reasons",
            {"job_id": "uuid"}, ["job_id"], dispatch_recommend),
        "cash_turnin_count": _t(
            "Count photographed bills and coins for a cash turn-in and submit the count to Billing",
            {"agent_id": "uuid"}, ["agent_id"], cash_turnin_count),
        "remittance_evidence_upload": _t(
            "Submit remittance evidence (e.g. bank deposit slip image attached to the chat) for parsing",
            {"invoice_id": "uuid (optional)"}, [], remittance_evidence_upload),
    },
    "support": {
        "complaint_manage": _t(
            "List, view, annotate, or transition complaints/support cases",
            {"action": "list|view|note|status", "case_id": "uuid", "status": "filter or target status",
             "body": "note text"},
            ["action"], complaint_manage),
        "refund_process": _t(
            "Execute an approved refund payment (permission-gated)",
            {"refund_request_id": "uuid"}, ["refund_request_id"], refund_process),
        "refund_manage": _t(
            "List refund requests, review decisions, or approve/reject a refund case",
            {"action": "list|decisions|decide", "case_id": "uuid", "decision": "approved|denied",
             "amount_cents": "int", "reason": "text", "status": "filter"},
            ["action"], refund_manage),
    },
}
