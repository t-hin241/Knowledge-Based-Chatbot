import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.session import Base, get_db
from app.main import app

# ── In-memory SQLite test database ────────────────────────────────────────────
# No PostgreSQL needed to run tests.
# Each test gets a fresh in-memory DB — no state leaks between tests.

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def client():
    """
    Spins up a fresh in-memory DB, creates all tables, overrides the
    get_db dependency, yields an async test client, then tears down.

    Keeping everything inside one fixture (instead of session-scoped setup)
    avoids the event loop conflict that breaks pytest-asyncio.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ── Tests ─────────────────────────────────────────────────────────────────────

async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_register_success(client: AsyncClient):
    r = await client.post("/api/v1/auth/register", json={
        "email": "alice@example.com",
        "username": "alice",
        "password": "strongpassword123",
    })
    assert r.status_code == 201
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "bob@example.com", "username": "bob", "password": "password123"}
    r1 = await client.post("/api/v1/auth/register", json=payload)
    assert r1.status_code == 201

    r2 = await client.post("/api/v1/auth/register", json={**payload, "username": "bob2"})
    assert r2.status_code == 409
    assert "email" in r2.json()["detail"]


async def test_register_duplicate_username(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "carol1@example.com",
        "username": "carol",
        "password": "password123",
    })
    r = await client.post("/api/v1/auth/register", json={
        "email": "carol2@example.com",
        "username": "carol",
        "password": "password123",
    })
    assert r.status_code == 409
    assert "username" in r.json()["detail"]


async def test_login_success(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "dave@example.com",
        "username": "dave",
        "password": "mypassword99",
    })
    r = await client.post("/api/v1/auth/login", json={
        "email": "dave@example.com",
        "password": "mypassword99",
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "eve@example.com",
        "username": "eve",
        "password": "correct_password",
    })
    r = await client.post("/api/v1/auth/login", json={
        "email": "eve@example.com",
        "password": "wrong_password",
    })
    assert r.status_code == 401


async def test_login_nonexistent_user(client: AsyncClient):
    r = await client.post("/api/v1/auth/login", json={
        "email": "ghost@example.com",
        "password": "doesntmatter",
    })
    assert r.status_code == 401


async def test_me_authenticated(client: AsyncClient):
    reg = await client.post("/api/v1/auth/register", json={
        "email": "frank@example.com",
        "username": "frank",
        "password": "securepass1",
    })
    token = reg.json()["access_token"]
    r = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == "frank@example.com"
    assert body["user"]["username"] == "frank"
    assert "hashed_password" not in body["user"]


async def test_me_no_token(client: AsyncClient):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


async def test_me_invalid_token(client: AsyncClient):
    r = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer this.is.not.valid"},
    )
    assert r.status_code == 401