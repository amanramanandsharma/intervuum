# app/orchestrator.py
from typing import Dict, Any, List
import time, uuid
from data.content import RUBRICS, RESUMES
from vectorstore import upsert_document
from retrieval import bundle_queries, retrieve, is_grounded
from llm import generate_question, summarize_rubric_for_intro, make_intro

# Short-term, in-memory runtime
SESSIONS: Dict[str, Dict[str, Any]] = {}
INDEXED: bool = False

def uid() -> str: return str(uuid.uuid4())

def index_all_content():
    global INDEXED
    if INDEXED:  # idempotent
        return
    # Upsert rubrics
    for role, text in RUBRICS.items():
        upsert_document(doc_id=f"rubric::{role}", text=text, meta={"dtype":"rubric","role":role})
    # Upsert resumes
    for (candidate_name, role), text in RESUMES.items():
        upsert_document(doc_id=f"resume::{candidate_name}::{role}", text=text,
                        meta={"dtype":"resume","role":role,"candidate_name":candidate_name})
    INDEXED = True

def _recent(session_id: str, k=8) -> List[Dict[str, Any]]:
    turns = SESSIONS[session_id]["turns"]
    return turns[-k:]

def _inc_coverage(sess: Dict[str,Any], dim: str):
    cov = sess["coverage"]
    cov[dim] = cov.get(dim, 0) + 1

def start_session(*, candidate_name: str, role: str, minutes: int=60):
    index_all_content()  # ensure Qdrant ready

    # Validate existence
    if role not in RUBRICS:
        raise ValueError(f"No rubric found for role '{role}' in data/content.py")
    if (candidate_name, role) not in RESUMES:
        raise ValueError(f"No resume found for ({candidate_name}, {role}) in data/content.py")

    sid = uid()
    SESSIONS[sid] = {
        "candidate_name": candidate_name,
        "role": role,
        "minutes": minutes,
        "turns": [],
        "coverage": {},
        "started_at": time.time()
    }

    # Intro with rubric bullets
    bullets = summarize_rubric_for_intro(RUBRICS[role])
    intro = make_intro(candidate_name, role, bullets)
    SESSIONS[sid]["turns"].append({"actor":"ai","text":intro})

    # First grounded question (resume/projects)
    tgt = {"dimension":"Resume Projects","difficulty":"easy"}
    bundle = bundle_queries(candidate_name, role, None, tgt)
    grounded = retrieve(bundle, filters={"role": role})
    try:
        q = generate_question(
            snippets=grounded["snippets"],
            candidate_name=candidate_name,
            role=role,
            target=tgt,
            recent_turns=_recent(sid)
        )
        if not is_grounded(q):
            # Ensure at least one resume hit if possible: if empty, fall back to clarifier
            q = {
                "question": "Could you briefly walk me through your most relevant project in your resume and your specific responsibilities?",
                "followups": ["What were the key constraints and success metrics?"],
                "dimension": "Resume Projects",
                "difficulty": "easy",
                "rationale_citations": grounded.get("citations", [])
            }
    except Exception:
        q = {
            "question": "Could you briefly walk me through your most relevant project in your resume and your specific responsibilities?",
            "followups": ["What were the key constraints and success metrics?"],
            "dimension": "Resume Projects",
            "difficulty": "easy",
            "rationale_citations": grounded.get("citations", [])
        }

    SESSIONS[sid]["turns"].append({"actor":"ai","text":q["question"], "citations": q.get("rationale_citations", grounded["citations"])})
    _inc_coverage(SESSIONS[sid], q.get("dimension", tgt["dimension"]))
    return {"session_id": sid, "intro": intro, "question": q}

def next_turn(*, session_id: str, candidate_text: str):
    sess = SESSIONS.get(session_id)
    assert sess, "invalid session_id"
    role = sess["role"]
    name = sess["candidate_name"]

    # append candidate turn
    sess["turns"].append({"actor":"candidate","text":candidate_text})

    # choose next dimension with lowest coverage (simple heuristic)
    dims = ["System Design","Problem Solving","Data/SQL","Resume Projects","Architecture Decisions","Ownership","Communication","Leadership"]
    counts = {d: sess["coverage"].get(d, 0) for d in dims}
    target_dim = min(counts, key=counts.get)
    diff = "easy" if counts[target_dim] < 2 else ("medium" if counts[target_dim] < 4 else "hard")
    tgt = {"dimension": target_dim, "difficulty": diff}

    # retrieve grounded context (resume + rubric + last answer)
    bundle = bundle_queries(name, role, candidate_text, tgt)
    grounded = retrieve(bundle, filters={"role": role})

    try:
        q = generate_question(
            snippets=grounded["snippets"],
            candidate_name=name,
            role=role,
            target=tgt,
            recent_turns=_recent(session_id)
        )
        if not is_grounded(q):
            q = {
                "question": f"Staying on {tgt['dimension']}, could you share a concrete example from your resume that best demonstrates your skills here?",
                "followups": ["What tradeoffs did you consider?", "How did you validate success?"],
                "dimension": tgt["dimension"],
                "difficulty": tgt["difficulty"],
                "rationale_citations": grounded.get("citations", [])
            }
    except Exception:
        q = {
            "question": f"Staying on {tgt['dimension']}, could you share a concrete example from your resume that best demonstrates your skills here?",
            "followups": ["What tradeoffs did you consider?", "How did you validate success?"],
            "dimension": tgt["dimension"],
            "difficulty": tgt["difficulty"],
            "rationale_citations": grounded.get("citations", [])
        }

    sess["turns"].append({"actor":"ai","text":q["question"], "citations": q.get("rationale_citations", grounded["citations"])})
    _inc_coverage(sess, q.get("dimension", tgt["dimension"]))
    return {"question": q, "coverage": sess["coverage"]}
