from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# The engine is the low-level connection pool.
# echo=settings.DEBUG prints SQL to stdout in dev — turn off in prod.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,   # test connections before use (handles DB restarts)
    pool_size=10,
    max_overflow=20,
)

# Session factory — every request gets its own session from this factory.
# expire_on_commit=False means we can still read attributes after commit
# without triggering another DB round-trip (important for async).
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """
    All SQLAlchemy models inherit from this Base.
    Centralising it here means Alembic can discover every table
    just by importing Base.metadata.
    """
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields a DB session and guarantees cleanup.

    Usage in a route:
        async def my_route(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise