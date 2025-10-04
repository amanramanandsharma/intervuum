# app/llm.py
import json
from typing import Dict, Any, List
from openai import OpenAI
from config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)

SYSTEM_QG = """You are an Interview Question Generator. STRICT RULES:
- Use only the provided snippets (resume & rubric) to ground the question; include citations.
- Output JSON ONLY:
{
 "question": "string",
 "followups": ["string", ...],   // 0-2 short probes
 "dimension": "string",
 "difficulty": "easy|medium|hard",
 "rationale_citations": ["rubric:doc#c1","resume:doc#c3", ...]
}
- Keep concise but precise. Prefer how/why/tradeoffs/metrics/failures.
- When the target dimension relates to resume/projects, include at least one resume citation.
"""

def _fmt_snippets(snips: List[Dict[str, Any]]) -> str:
    lines = []
    for s in snips:
        dtype = s["meta"].get("dtype","doc")
        tag = f"{dtype}:{s['doc_id']}#c{s['chunk_idx']}"
        lines.append(f"[{tag}] {s['text']}")
    return "\n".join(lines)

def generate_question(*, snippets, candidate_name: str, role: str, target: Dict[str, Any], recent_turns: List[Dict[str, Any]]):
    ctx = f"""Role: {role}
Candidate: {candidate_name}
Target: {target}
Recent:
{ [t['actor']+': '+t['text'] for t in recent_turns[-2:]] }
Snippets:
{_fmt_snippets(snippets)}
Return JSON only."""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type":"json_object"},
        messages=[
            {"role":"system","content":SYSTEM_QG},
            {"role":"user","content":ctx}
        ],
        temperature=0.2,
        max_tokens=500
    )
    return json.loads(resp.choices[0].message.content)

SYSTEM_RUBRIC_SUM = """You summarize rubrics. Output JSON only:
{ "bullets": ["short, plain-language bullet 1", "..."] }
Return 4-7 bullets. No extra prose.
"""

def summarize_rubric_for_intro(rubric_text: str) -> List[str]:
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role":"system","content":SYSTEM_RUBRIC_SUM},
            {"role":"user","content":rubric_text[:6000]}
        ],
        temperature=0.2,
        max_tokens=400
    )
    data = json.loads(resp.choices[0].message.content)
    return data.get("bullets", [])[:7]

def make_intro(candidate_name: str, role: str, bullets: List[str]) -> str:
    return (
        f"Hi {candidate_name}, I’m your AI interviewer for the {role} role. "
        "Here’s how today will work: we’ll spend ~60 minutes on technical and behavioral topics. "
        "I’ll ask questions grounded in your resume and the provided rubric, and I may probe with follow-ups. "
        "We’re looking at the following signals:\n"
        + "\n".join([f"• {b}" for b in bullets]) +
        "\nWe’ll keep it conversational—feel free to ask clarifying questions. Ready?"
    )
