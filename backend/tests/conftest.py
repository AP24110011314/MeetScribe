from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.main import app

test_engine = create_async_engine(settings.TEST_DATABASE_URL, poolclass=NullPool)
TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

test_sync_engine = create_engine(settings.TEST_DATABASE_URL_SYNC, poolclass=NullPool)
TestSyncSessionLocal = sessionmaker(
    bind=test_sync_engine,
    class_=Session,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest.fixture(autouse=True)
async def clean_database(monkeypatch, tmp_path_factory) -> AsyncGenerator[None, None]:
    # Reset in-memory rate limiter
    limiter.reset()

    # Route sync DB calls in workers/reaper to test database
    monkeypatch.setattr("app.db.session.SyncSessionLocal", TestSyncSessionLocal)

    # Use fake transcriber in test suite to avoid downloading Whisper models
    monkeypatch.setattr(settings, "TRANSCRIBER", "fake")

    # Use local storage backend with isolated temp directory for test suite
    temp_storage = tmp_path_factory.mktemp("test_uploads")
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "LOCAL_STORAGE_DIR", str(temp_storage))

    # Clean tables before each test
    async with test_engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE users, meetings, action_items, jobs, summaries, transcripts "
                "RESTART IDENTITY CASCADE;"
            )
        )
    yield


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:8000") as ac:
        yield ac
    app.dependency_overrides.clear()
