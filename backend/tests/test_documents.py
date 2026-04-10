"""
Phase 2 tests — document upload, listing, status polling, deletion.

Key pattern: patch process_document at the service level so background
tasks never actually run during tests. This isolates HTTP layer tests
from the AI pipeline (which has its own unit tests below).
"""
import io
from unittest.mock import AsyncMock, patch

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.session import Base, get_db
from app.main import app
from app.models.document import DocumentStatus

TEST_DB = "sqlite+aiosqlite:///:memory:"

# Patch target — where process_document is USED, not where it's defined
PROCESS_PATCH = "app.api.v1.documents.process_document"


@pytest_asyncio.fixture
async def client(tmp_path):
    """Authenticated test client with isolated DB and temp upload dir."""
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

    with patch("app.core.config.settings.UPLOAD_DIR", str(tmp_path)), \
         patch("app.api.v1.documents.settings.UPLOAD_DIR", str(tmp_path)):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            await ac.post("/api/v1/auth/register", json={
                "email": "uploader@example.com",
                "username": "uploader",
                "password": "testpass99",
            })
            login = await ac.post("/api/v1/auth/login", json={
                "email": "uploader@example.com",
                "password": "testpass99",
            })
            ac.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
            yield ac

    app.dependency_overrides.clear()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


def _txt_file(name: str = "test.txt", content: str = "Hello world. This is a test document."):
    return ("file", (name, io.BytesIO(content.encode()), "text/plain"))


# ── Upload tests ──────────────────────────────────────────────────────────────

async def test_upload_txt(client: AsyncClient):
    with patch(PROCESS_PATCH, new_callable=AsyncMock):
        r = await client.post("/api/v1/documents/upload", files=[_txt_file()])
    assert r.status_code == 202
    data = r.json()
    assert data["filename"] == "test.txt"
    assert data["status"] == DocumentStatus.PENDING
    assert data["size_bytes"] > 0


async def test_upload_unsupported_type(client: AsyncClient):
    r = await client.post(
        "/api/v1/documents/upload",
        files=[("file", ("image.png", io.BytesIO(b"fake png"), "image/png"))],
    )
    assert r.status_code == 415


async def test_upload_empty_file(client: AsyncClient):
    r = await client.post(
        "/api/v1/documents/upload",
        files=[("file", ("empty.txt", io.BytesIO(b""), "text/plain"))],
    )
    assert r.status_code == 400


# ── List / get tests ──────────────────────────────────────────────────────────

async def test_list_documents_empty(client: AsyncClient):
    r = await client.get("/api/v1/documents")
    assert r.status_code == 200
    assert r.json() == {"documents": [], "total": 0}


async def test_list_documents_after_upload(client: AsyncClient):
    with patch(PROCESS_PATCH, new_callable=AsyncMock):
        await client.post("/api/v1/documents/upload", files=[_txt_file("a.txt", "Doc one")])
        await client.post("/api/v1/documents/upload", files=[_txt_file("b.txt", "Doc two")])

    r = await client.get("/api/v1/documents")
    assert r.status_code == 200
    assert r.json()["total"] == 2


async def test_get_document_by_id(client: AsyncClient):
    with patch(PROCESS_PATCH, new_callable=AsyncMock):
        upload = await client.post("/api/v1/documents/upload", files=[_txt_file()])
    doc_id = upload.json()["id"]

    r = await client.get(f"/api/v1/documents/{doc_id}")
    assert r.status_code == 200
    assert r.json()["id"] == doc_id


async def test_get_document_not_found(client: AsyncClient):
    r = await client.get("/api/v1/documents/9999")
    assert r.status_code == 404


# ── Delete tests ──────────────────────────────────────────────────────────────

async def test_delete_document(client: AsyncClient):
    with patch(PROCESS_PATCH, new_callable=AsyncMock):
        upload = await client.post("/api/v1/documents/upload", files=[_txt_file()])
    doc_id = upload.json()["id"]

    r = await client.delete(f"/api/v1/documents/{doc_id}")
    assert r.status_code == 204

    r2 = await client.get(f"/api/v1/documents/{doc_id}")
    assert r2.status_code == 404


async def test_delete_nonexistent_document(client: AsyncClient):
    r = await client.delete("/api/v1/documents/9999")
    assert r.status_code == 404


# ── Unit tests for the processing pipeline (no DB, no HTTP) ──────────────────

async def test_chunk_text_basic():
    from app.services.doc_processor import chunk_text
    text = "word " * 300
    chunks = chunk_text(text, chunk_size=200, overlap=20)
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk) < 300


async def test_chunk_text_overlap():
    from app.services.doc_processor import chunk_text
    text = " ".join(f"word{i}" for i in range(200))
    chunks = chunk_text(text, chunk_size=100, overlap=30)
    assert len(chunks) >= 2
    last_words = set(chunks[0].split()[-3:])
    first_words = set(chunks[1].split()[:6])
    assert last_words & first_words


async def test_chunk_text_empty():
    from app.services.doc_processor import chunk_text
    assert chunk_text("", 512, 50) == []
    assert chunk_text("   ", 512, 50) == []


async def test_clean_text():
    from app.services.doc_processor import clean_text
    messy = "Hello   world\n\n\n\nNew paragraph   here  "
    clean = clean_text(messy)
    assert "\n\n\n" not in clean
    assert "  " not in clean
    assert clean == clean.strip()


async def test_extract_txt(tmp_path):
    from app.services.doc_processor import extract_text
    f = tmp_path / "sample.txt"
    f.write_text("Hello from file", encoding="utf-8")
    result = extract_text(f, "text/plain")
    assert "Hello from file" in result