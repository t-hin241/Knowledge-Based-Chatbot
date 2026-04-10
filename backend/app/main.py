from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import auth, documents, chat
from app.core.config import settings
from app.db.session import engine
from app.models import user, document          # noqa: F401
from app.models import chat as chat_models 


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure upload directory exists
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
 
    if settings.DEBUG:
        # Local dev only — auto-create tables without Alembic
        from app.db.session import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    else:
        # Production — run Alembic migrations on every startup.
        # This is safe: Alembic is idempotent (won't re-run applied migrations).
        import asyncio
        from alembic.config import Config
        from alembic import command
 
        def run_migrations():
            alembic_cfg = Config("alembic.ini")
            command.upgrade(alembic_cfg, "head")
 
        await asyncio.get_event_loop().run_in_executor(None, run_migrations)
 
    yield
 
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Realtime knowledge chatbot with RAG and web research",
    lifespan=lifespan,
    # Disable docs in production for security
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# In production, replace ["*"] with your actual frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.mount("/api/v1/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(chat.router,      prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME}