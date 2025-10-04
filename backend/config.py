# app/config.py
import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
TRANSCRIBE_MODEL = os.getenv("TRANSCRIBE_MODEL", "gpt-4o-transcribe")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "interview_docs")

assert OPENAI_API_KEY, "Missing OPENAI_API_KEY"
assert QDRANT_URL and QDRANT_API_KEY, "Missing Qdrant credentials"
