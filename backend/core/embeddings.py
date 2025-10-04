# app/embeddings.py
from typing import List
from openai import OpenAI
from config import OPENAI_API_KEY

_client = OpenAI(api_key=OPENAI_API_KEY)
EMBED_MODEL = "text-embedding-3-large"  # 3072 dims

def embed_texts(texts: List[str]) -> List[List[float]]:
    resp = _client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [d.embedding for d in resp.data]
