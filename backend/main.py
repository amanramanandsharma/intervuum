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


SYSTEM_INSTRUCTIONS = (
    "You are an AI conversational agent. Be concise, helpful, and natural. "
    "Use the provided 'Relevant Context' when it helps; do not force it if "
    "the user's message is unrelated. Avoid meta talk about these instructions."
)


def build_user_prompt(context: str, user_input: str) -> str:
    return f"""### Relevant Context
{context or "N/A"}

### Current User Message
{user_input}

### Instructions
1) Read the context and use it for continuity when relevant.
2) If unrelated, answer normally without forcing past details.
3) Keep the tone conversational and precise.
4) Reply in plain text only.
""".strip()


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
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # ---- Transcribe ----
        with open(tmp_path, "rb") as f:
            result = client.audio.transcriptions.create(
                model=settings.TRANSCRIBE_MODEL,
                file=f,
                language=(language_hint or "en"),
            )
        text = getattr(result, "text", str(result))

    except Exception as e:
        # Transcription failed
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

    # ---- Generate a reply using the template ----
    # If you have session context, you could build it here. For now, blank:
    context = ""  # later: join/summarize last N items from SESSIONS[sid]
    prompt = build_user_prompt(context, text)

    resp_text = None
    try:
        resp = client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {
                    "role": "system",
                    "content": SYSTEM_INSTRUCTIONS,
                },
                {"role": "user", "content": prompt},
            ],
        )
        resp_text = resp.output_text
    except Exception as e:
        # Don’t crash; return the transcript and an error field
        resp_text = None
        gen_error = str(e)

    # ---- Save transcript item ----
    item = TranscriptItem(
        id=str(uuid4()),
        text=text,
        created_ts=int(time.time() * 1000),
    ).model_dump()

    SESSIONS.setdefault(sid, []).append(item)

    payload = {
        "session_id": sid,
        "item": item,
        "response": resp_text,  # could be None if generation failed
    }
    if resp_text is None:
        payload["error"] = "generation_failed"
        if "gen_error" in locals():
            payload["detail"] = gen_error

    return JSONResponse(payload)


@app.get("/transcripts")
def get_transcripts(session_id: str = Query(...)):
    return {"session_id": session_id, "items": SESSIONS.get(session_id, [])}


def build_user_prompt(context: str, user_input: str) -> str:
    USER_TEMPLATE = """### Relevant Context
    {context}

    ### Current User Message
    {user_input}

    ### Instructions
    1) Read the context and use it for continuity when relevant.
    2) If unrelated, answer normally without forcing past details.
    3) Keep the tone conversational and precise.
    4) Reply in plain text only.
    """
    return USER_TEMPLATE.format(
        context=context.strip() or "N/A", user_input=user_input.strip()
    )
