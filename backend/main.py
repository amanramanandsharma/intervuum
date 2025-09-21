# main.py
from fastapi import FastAPI, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, List, Optional
from uuid import uuid4
import tempfile, os, time

from settings import settings
from openai import OpenAI

app = FastAPI(title="Transcriber API", version="1.0.0")

# CORS (lock this down for prod)
allowed = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed if allowed else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=settings.OPENAI_API_KEY)

# super tiny in-memory store (use Redis/DB for production)
SESSIONS: Dict[str, List[Dict]] = {}

class TranscriptItem(BaseModel):
    id: str
    text: str
    language: Optional[str] = None
    duration_sec: Optional[float] = None
    created_ts: int

@app.get("/health")
def health():
    return {"ok": True, "model": settings.TRANSCRIBE_MODEL}

@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    language_hint: Optional[str] = Form(None),
):
    """
    Accepts audio blobs (webm/ogg/wav/m4a). Returns a transcript chunk and session_id.
    """
    sid = session_id or str(uuid4())

    # Save upload to a temp file so OpenAI SDK can read a real file handle
    suffix = os.path.splitext(file.filename or "")[-1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            # gpt-4o-transcribe (fast, accurate) or whisper-1
            result = client.audio.transcriptions.create(
                model=settings.TRANSCRIBE_MODEL,
                file=f,
                language="en",
                # response_format="verbose_json",  # optional: paragraphs/segments
                # temperature=0,                   # optional
            )
        text = getattr(result, "text", str(result))
    finally:
        try: os.remove(tmp_path)
        except: pass

    item = TranscriptItem(
        id=str(uuid4()),
        text=text,
        created_ts=int(time.time() * 1000),
    ).model_dump()

    SESSIONS.setdefault(sid, []).append(item)
    return JSONResponse({"session_id": sid, "item": item})

@app.get("/transcripts")
def get_transcripts(session_id: str = Query(...)):
    return {"session_id": session_id, "items": SESSIONS.get(session_id, [])}
