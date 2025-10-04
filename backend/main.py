# main.py
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, List, Optional
from uuid import uuid4
import tempfile, os, time

from config import OPENAI_API_KEY, ALLOWED_ORIGINS, TRANSCRIBE_MODEL
from openai import OpenAI

# === Interview brain (Qdrant-only, local rubric/resume) ===
from core.orchestrator import (
    start_session as brain_start_session,
    next_turn as brain_next_turn,
    index_all_content as brain_index_all_content,
)

app = FastAPI(title="Transcriber + Interview Brain", version="1.1.0")

# CORS
allowed = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed if allowed else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=OPENAI_API_KEY)

# In-memory stores
SESSIONS_TRANSCRIPTS: Dict[str, List[Dict]] = {}
FIRST_QUESTIONS_CACHE: Dict[str, Dict] = {}  # session_id -> first question JSON


class TranscriptItem(BaseModel):
    id: str
    text: str
    language: Optional[str] = None
    duration_sec: Optional[float] = None
    created_ts: int


@app.on_event("startup")
def _startup():
    # Ensure Qdrant is indexed with local rubric & resume content
    brain_index_all_content()


@app.get("/health")
def health():
    return {"ok": True, "model": TRANSCRIBE_MODEL}


# ---------- 1) Startup API: greeting only (no question) ----------
class StartupIn(BaseModel):
    candidate_name: str
    role: str
    minutes: Optional[int] = 60

@app.post("/startup_interview")
def startup_interview(payload: StartupIn):
    """
    Initialize an interview session:
      - Returns greetings/intro only (no question).
      - Internally prepares the first grounded question and caches it.
    Client should then call /transcribe to start Q&A.
    """
    try:
        start_payload = brain_start_session(
            candidate_name=payload.candidate_name,
            role=payload.role,
            minutes=int(payload.minutes or 60),
        )
        session_id = start_payload["session_id"]
        # Cache the first question; only return the intro now
        FIRST_QUESTIONS_CACHE[session_id] = start_payload["question"]
        return JSONResponse(
            {
                "session_id": session_id,
                "ai_intro": start_payload["intro"],  # greeting + rubric explanation
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "startup_failed", "detail": str(e)},
        )


# ---------- 2) Transcribe API: start Q&A (then subsequent turns) ----------
@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    language_hint: Optional[str] = Form(None),
):
    """
    Upload audio (webm/ogg/wav/m4a) and get:
      - On first call right after /startup_interview: the first grounded question (ignores transcript for Q&A start)
      - On subsequent calls: treats transcript as candidate's answer and returns next grounded question
    """
    if not session_id:
        return JSONResponse(
            status_code=400,
            content={
                "error": "missing_session_id",
                "detail": "Provide 'session_id' from /startup_interview.",
            },
        )

    sid = session_id

    # Save upload to a temp file so OpenAI SDK can read a real file handle
    suffix = os.path.splitext(file.filename or "")[-1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # ---- Transcribe ----
        with open(tmp_path, "rb") as f:
            result = client.audio.transcriptions.create(
                model=TRANSCRIBE_MODEL,
                file=f,
                language=(language_hint or "en"),
            )
        text = getattr(result, "text", str(result))

    except Exception as e:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except:
                pass
        return JSONResponse(
            status_code=500,
            content={
                "session_id": sid,
                "error": "transcription_failed",
                "detail": str(e),
            },
        )
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except:
                pass

    # Save transcript chunk locally (optional)
    item = TranscriptItem(
        id=str(uuid4()),
        text=text,
        created_ts=int(time.time() * 1000),
    ).model_dump()
    SESSIONS_TRANSCRIPTS.setdefault(sid, []).append(item)

    # If we still have the FIRST question cached for this session, return it now and clear the cache.
    if sid in FIRST_QUESTIONS_CACHE:
        first_q = FIRST_QUESTIONS_CACHE.pop(sid)
        return JSONResponse(
            {
                "session_id": sid,
                "item": item,             # user's "ready" / greeting transcript
                "ai_question": first_q,   # first grounded question (with citations)
                "coverage": {"Resume Projects": 1},  # aligns with brain’s first hit
                "note": "First Q&A has started. Subsequent /transcribe calls will treat audio as your answer.",
            }
        )

    # Otherwise, treat this transcript as the candidate's answer and advance Q&A
    try:
        nxt = brain_next_turn(session_id=sid, candidate_text=text)
        response_payload = {
            "session_id": sid,
            "item": item,           # transcript chunk
            "ai_question": nxt["question"],  # next grounded question JSON (with citations)
            "coverage": nxt.get("coverage"),
        }
        return JSONResponse(response_payload)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "session_id": sid,
                "item": item,
                "error": "interview_brain_failed",
                "detail": str(e),
            },
        )
