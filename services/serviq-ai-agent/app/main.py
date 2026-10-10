"""ServIQ AI Agent — constrained boundary service (ADR-0003/0012).

Exposes document parsing only. No database. Tool-style endpoints forward
the caller's JWT to the owning microservice — never a service credential.
"""
import os

from fastapi import FastAPI, File, HTTPException, UploadFile

from .parser import parse_document

app = FastAPI(title="serviq-ai-agent")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "ai-agent",
        "mode": os.environ.get("AI_MODEL_MODE", "stub"),
        "vision_model": os.environ.get("AI_VISION_MODEL", "moondream"),
    }


@app.post("/api/v1/parse")
async def parse(file: UploadFile = File(...)):
    """Classify document_type → extract schema → structured JSON."""
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    return parse_document(data)
