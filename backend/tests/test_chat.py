"""
Phase 3 tests — chat sessions, SSE streaming, RAG engine unit tests.

All external calls (Groq API, ChromaDB, embeddings, DuckDuckGo)
are mocked. Tests validate HTTP layer + business logic only.

Key mock pattern:
  patch(RAG_PATCH, new=_fake_rag)      ← replaces the function directly
  NOT side_effect=_fake_rag            ← that makes Mock call it and
                                          return the coroutine object,
                                          breaking async for iteration.
"""
import json
from unittest.mock import patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.session import Base, get_db
from app.main import app

TEST_DB = "sqlite+aiosqlite:///:memory:"
RAG_PATCH  = "app.api.v1.chat.stream_rag_response"
SAVE_PATCH = "app.api.v1.chat._save_assistant_message" 


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client():
    engine = create_async_engine(TEST_DB, echo=False)
    factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_db():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "chatter@example.com",
            "username": "chatter",
            "password": "testpass99",
        })
        login = await ac.post("/api/v1/auth/login", json={
            "email": "chatter@example.com",
            "password": "testpass99",
        })
        ac.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
        yield ac

    app.dependency_overrides.clear()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ── Mock RAG generator ────────────────────────────────────────────────────────

async def _fake_rag(*args, **kwargs):
    """
    Async generator that mimics stream_rag_response event sequence.
    Used as new= (not side_effect=) so it IS the function, not a wrapper.
    """
    yield {"type": "sources", "sources": [
        {"type": "document", "document_id": 1, "chunk_index": 0},
        {"type": "web", "url": "https://example.com", "title": "Example"},
    ]}
    for word in ["Hello", " from", " Nexus", "!"]:
        yield {"type": "token", "token": word}
    yield {"type": "done", "full_text": "Hello from Nexus!", "sources": []}


def _parse_sse(raw: str) -> list[dict]:
    """Parse raw SSE response text into decoded JSON event dicts."""
    events = []
    for line in raw.strip().splitlines():
        line = line.strip()
        if line.startswith("data:"):
            payload = line[len("data:"):].strip()
            if payload:
                try:
                    events.append(json.loads(payload))
                except json.JSONDecodeError:
                    pass
    return events


# ── Session management tests ──────────────────────────────────────────────────

async def test_list_sessions_empty(client: AsyncClient):
    r = await client.get("/api/v1/chat/sessions")
    assert r.status_code == 200
    assert r.json() == {"sessions": [], "total": 0}


async def test_get_session_not_found(client: AsyncClient):
    r = await client.get("/api/v1/chat/sessions/9999")
    assert r.status_code == 404


async def test_delete_session_not_found(client: AsyncClient):
    r = await client.delete("/api/v1/chat/sessions/9999")
    assert r.status_code == 404


# ── SSE streaming tests ───────────────────────────────────────────────────────

async def test_chat_stream_creates_session(client: AsyncClient):
    """A new session is auto-created when session_id is None."""
    with patch(RAG_PATCH, new=_fake_rag), \
         patch(SAVE_PATCH, return_value=1):
        r = await client.post("/api/v1/chat/stream", json={
            "message": "What is RAG?",
            "session_id": None,
        })
    assert r.status_code == 200

    events = _parse_sse(r.text)
    types = [e["type"] for e in events]

    assert "sources" in types
    assert "token"   in types
    assert "done"    in types

    done = next(e for e in events if e["type"] == "done")
    assert "session_id"  in done
    assert "message_id"  in done


async def test_chat_stream_tokens_received(client: AsyncClient):
    """Token events reconstruct the full answer when concatenated."""
    with patch(RAG_PATCH, new=_fake_rag), \
         patch(SAVE_PATCH, return_value=1):
        r = await client.post("/api/v1/chat/stream", json={
            "message": "Tell me something",
        })

    events = _parse_sse(r.text)
    tokens = [e["token"] for e in events if e["type"] == "token"]
    assert "".join(tokens) == "Hello from Talk2Bot Doc!"


async def test_chat_stream_sources_emitted_first(client: AsyncClient):
    """Sources event must arrive before any token events."""
    with patch(RAG_PATCH, new=_fake_rag), \
         patch(SAVE_PATCH, return_value=1):
        r = await client.post("/api/v1/chat/stream", json={
            "message": "Summarise the document",
        })

    events = _parse_sse(r.text)
    types = [e["type"] for e in events]
    sources_idx     = types.index("sources")
    first_token_idx = types.index("token")
    assert sources_idx < first_token_idx


async def test_chat_stream_continue_existing_session(client: AsyncClient):
    """Providing session_id reuses the session and appends messages."""
    with patch(RAG_PATCH, new=_fake_rag), \
         patch(SAVE_PATCH, return_value=1):
        r1 = await client.post("/api/v1/chat/stream", json={"message": "First"})
    session_id = next(e for e in _parse_sse(r1.text) if e["type"] == "done")["session_id"]

    with patch(RAG_PATCH, new=_fake_rag), \
         patch(SAVE_PATCH, return_value=1):
        r2 = await client.post("/api/v1/chat/stream", json={
            "message": "Follow-up",
            "session_id": session_id,
        })
    done2 = next(e for e in _parse_sse(r2.text) if e["type"] == "done")
    assert done2["session_id"] == session_id


async def test_chat_session_history_persisted(client: AsyncClient):
    """After streaming, both user and assistant messages are in the DB."""
    with patch(RAG_PATCH, new=_fake_rag), \
         patch(SAVE_PATCH, return_value=1):
        r = await client.post("/api/v1/chat/stream", json={"message": "Hello Talk2Doc Bot!"})
    session_id = next(e for e in _parse_sse(r.text) if e["type"] == "done")["session_id"]

    r2 = await client.get(f"/api/v1/chat/sessions/{session_id}")
    assert r2.status_code == 200
    roles = [m["role"] for m in r2.json()["messages"]]
    assert "user"      in roles
    assert "assistant" in roles


async def test_chat_session_listed_after_creation(client: AsyncClient):
    with patch(RAG_PATCH, new=_fake_rag), \
         patch(SAVE_PATCH, return_value=1):
        await client.post("/api/v1/chat/stream", json={"message": "Hi"})
    r = await client.get("/api/v1/chat/sessions")
    assert r.json()["total"] == 1


async def test_delete_session(client: AsyncClient):
    with patch(RAG_PATCH, new=_fake_rag), \
         patch(SAVE_PATCH, return_value=1):
        r = await client.post("/api/v1/chat/stream", json={"message": "Temp"})
    session_id = next(e for e in _parse_sse(r.text) if e["type"] == "done")["session_id"]

    assert (await client.delete(f"/api/v1/chat/sessions/{session_id}")).status_code == 204
    assert (await client.get(f"/api/v1/chat/sessions/{session_id}")).status_code == 404


async def test_chat_unauthenticated():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        r = await ac.post("/api/v1/chat/stream", json={"message": "hi"})
    assert r.status_code == 401


# ── RAG engine unit tests ─────────────────────────────────────────────────────

async def test_build_system_prompt_with_context():
    from app.services.rag_engine import _build_system_prompt
    prompt = _build_system_prompt(
        doc_context="[Doc 1]\nsome text",
        web_context="[Web 1]\nsome web",
    )
    assert "[Doc 1]"  in prompt
    assert "[Web 1]"  in prompt
    assert "Talk2Doc Bot"    in prompt


async def test_build_system_prompt_no_context():
    from app.services.rag_engine import _build_system_prompt
    prompt = _build_system_prompt("", "")
    assert "general knowledge" in prompt


async def test_trim_history_keeps_recent():
    from app.services.rag_engine import _trim_history
    history = [{"role": "user", "content": f"msg {i}"} for i in range(20)]
    trimmed = _trim_history(history, max_messages=6)
    assert len(trimmed) == 6
    assert trimmed[-1]["content"] == "msg 19"


async def test_trim_history_no_change_when_short():
    from app.services.rag_engine import _trim_history
    history = [{"role": "user", "content": "hi"}]
    assert _trim_history(history, max_messages=10) == history


async def test_build_doc_context_empty():
    from app.services.rag_engine import _build_doc_context
    assert _build_doc_context([]) == ""


async def test_build_doc_context_formats_correctly():
    from app.services.rag_engine import _build_doc_context
    chunks = [
        {"document_id": 1, "chunk_index": 0, "text": "The sky is blue.", "distance": 0.1},
        {"document_id": 2, "chunk_index": 3, "text": "Water is wet.",    "distance": 0.2},
    ]
    ctx = _build_doc_context(chunks)
    assert "document_id=1"   in ctx
    assert "The sky is blue." in ctx
    assert "document_id=2"   in ctx