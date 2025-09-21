# settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    OPENAI_API_KEY: str
    TRANSCRIBE_MODEL: str = "gpt-4o-transcribe"
    ALLOWED_ORIGINS: str = "*"  # "http://localhost:4200,https://yourdomain.com"
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
