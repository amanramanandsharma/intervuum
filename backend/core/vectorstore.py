# app/vectorstore.py
from typing import List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
import uuid
from config import QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION
from embeddings import embed_texts

client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def ensure_collection():
    cols = client.get_collections().collections
    if QDRANT_COLLECTION not in [c.name for c in cols]:
        client.recreate_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=VectorParams(size=3072, distance=Distance.COSINE)
        )

def _chunk(text: str, max_chars=1800, overlap=200) -> List[str]:
    out, i, n = [], 0, len(text)
    while i < n:
        j = min(i + max_chars, n)
        out.append(text[i:j])
        if j == n: break
        i = max(0, j - overlap)
    return out

def upsert_document(*, doc_id: str, text: str, meta: Dict[str, Any]) -> int:
    ensure_collection()
    chunks = _chunk(text)
    vecs = embed_texts(chunks)
    points = []
    for idx, (ch, v) in enumerate(zip(chunks, vecs)):
        pid = str(uuid.uuid4())
        payload = {
            "doc_id": doc_id,
            "chunk_idx": idx,
            "text": ch,
            **meta,  # expected: dtype ('resume'|'rubric'), role, candidate_name (opt)
        }
        points.append(PointStruct(id=pid, vector=v, payload=payload))
    client.upsert(collection_name=QDRANT_COLLECTION, points=points)
    return len(points)

def search(query: str, *, top_k=8, filters: Dict[str, Any] | None=None):
    ensure_collection()
    qv = embed_texts([query])[0]
    qf = None
    if filters:
        conds = [FieldCondition(key=k, match=MatchValue(value=v)) for k, v in filters.items()]
        qf = Filter(must=conds)
    hits = client.search(collection_name=QDRANT_COLLECTION, query_vector=qv, limit=top_k, query_filter=qf)
    out = []
    for h in hits:
        p = h.payload or {}
        out.append({
            "score": h.score,
            "doc_id": p.get("doc_id"),
            "chunk_idx": p.get("chunk_idx"),
            "text": p.get("text"),
            "meta": {k: v for k, v in p.items() if k not in ["doc_id","chunk_idx","text"]}
        })
    return out
