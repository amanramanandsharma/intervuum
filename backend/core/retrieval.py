# app/retrieval.py
from typing import Dict, Any, List
from vectorstore import search

def bundle_queries(candidate_name: str, role: str, last_answer: str | None, target: Dict[str, Any]) -> List[str]:
    qs = [
        f"{role} interview rubric criteria",
        f"{candidate_name} resume details for {role}",
    ]
    if target and target.get("dimension"):
        qs.append(f"{role} rubric for {target['dimension']}")
        qs.append(f"resume achievements related to {target['dimension']} for {candidate_name}")
    if last_answer:
        qs.append(f"follow-up on: {last_answer[:300]}")
    return qs

def retrieve(bundle: List[str], filters: Dict[str, Any]) -> Dict[str, Any]:
    pool, seen = [], set()
    for q in bundle:
        for h in search(q, top_k=6, filters=filters):
            key = (h["doc_id"], h["chunk_idx"])
            if key in seen: continue
            seen.add(key)
            pool.append(h)
    pool.sort(key=lambda x: x["score"], reverse=True)
    top = pool[:6]
    citations = [f"{d['meta'].get('dtype','doc')}:{d['doc_id']}#c{d['chunk_idx']}" for d in top]
    return {"snippets": top, "citations": citations}

def is_grounded(model_out: Dict[str, Any]) -> bool:
    cits = model_out.get("rationale_citations") or []
    return bool(cits) and all(isinstance(c, str) and ":" in c for c in cits)
