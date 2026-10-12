"""ServIQ AI Agent — constrained boundary service (ADR-0003/0012).

Document parsing + profile-scoped chat. No database. Tool-style
endpoints forward the caller's JWT to the owning microservice — never
a service credential.
"""
import json
import os
import re

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .auth import AuthError, verify_token
from .orchestrator import ChatError, run_chat
from .parser import parse_document

app = FastAPI(title="serviq-ai-agent")

# Match the Laravel services' dev CORS posture (config/cors.php defaults):
# any origin, bearer-token auth — no cookies, so credentials stay off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

PROFILES = ("customer", "dispatcher", "support")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "ai-agent",
        "mode": os.environ.get("AI_MODEL_MODE", "stub"),
        "vision_model": os.environ.get("AI_VISION_MODEL", "moondream"),
        "text_model": os.environ.get("AI_TEXT_MODEL", "qwen2.5:3b"),
    }


@app.post("/api/v1/parse")
async def parse(file: UploadFile = File(...)):
    """Classify document_type → extract schema → structured JSON."""
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    return parse_document(data)


def _claims(request: Request) -> tuple[dict, str]:
    """Authenticate: same rules as every other service — signature,
    iss/aud/exp claims, shared blacklist (app.auth)."""
    token = re.sub(r"^Bearer\s+", "", request.headers.get("authorization", ""), flags=re.I)
    if not token:
        raise HTTPException(401, "unauthenticated")
    try:
        return verify_token(token), token
    except AuthError as e:
        raise HTTPException(401, f"invalid_token: {e}") from e


@app.post("/api/v1/chat")
async def chat(request: Request):
    """Profile-scoped conversational agent. JSON body
    {"profile", "message", "context"} or multipart form with the same
    fields plus `file` for upload tools (proof of payment, remittance
    evidence, cash turn-in photos)."""
    claims, token = _claims(request)

    upload = None
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        profile = form.get("profile") or ""
        message = form.get("message") or ""
        try:
            context = json.loads(form.get("context") or "{}")
        except ValueError:
            raise HTTPException(422, "context must be a JSON object")
        file = form.get("file")
        if file is not None and hasattr(file, "read"):
            upload = {"filename": getattr(file, "filename", None),
                      "content": await file.read(),
                      "content_type": getattr(file, "content_type", None)}
    else:
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(422, "object body expected")
        profile = body.get("profile") or ""
        message = body.get("message") or ""
        context = body.get("context") or {}

    if not isinstance(context, dict):
        raise HTTPException(422, "context must be an object")
    if profile not in PROFILES:
        raise HTTPException(422, f"profile must be one of: {', '.join(PROFILES)}")

    try:
        return run_chat(profile, message, context, claims, token, upload)
    except ChatError as e:
        raise HTTPException(422, str(e)) from e
