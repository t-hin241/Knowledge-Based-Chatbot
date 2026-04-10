from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────────────────────────
    APP_NAME: str = "Talk2Doc"
    DEBUG: bool = True

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/chatbot-postgres"

    # ── Auth / JWT ────────────────────────────────────────────────────────
    SECRET_KEY: str =""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Redis ─────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    model_config = {"env_file": ".venv", "extra": "ignore"}
    
     # ── Document storage ──────────────────────────────────────────────────
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
 
    # ── Vector store ──────────────────────────────────────────────────────
    CHROMA_PATH: str = ".chroma"
    EMBED_MODEL: str = "all-MiniLM-L6-v2"
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 50
    
    # ── RAG engine — Groq ────────────────────────────────────────────────
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    RAG_TOP_K: int = 5
    RAG_SIMILARITY_THRESHOLD: float = 0.75
    MAX_CONTEXT_CHARS: int = 12000
    MAX_HISTORY_MESSAGES: int = 10
 
    # ── Web research — DuckDuckGo (no key needed) ─────────────────────────
    DDG_MAX_RESULTS: int = 3
    DDG_REGION: str = "wt-wt"   # worldwide — change to "us-en", "vn-vi" etc.
 
    model_config = {"env_file": ".env", "extra": "ignore"}
 
 


# lru_cache means Settings() is only created once — no repeated .env reads
@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
