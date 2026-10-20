"""Shared pytest fixtures: a real Postgres test DB, isolated per test.

Each test gets its own engine bound to its own event loop (pytest-asyncio runs a fresh
loop per test), with `NullPool` so no connection is shared across loops. The schema is
created by running the migrations once per session.
"""

import os
from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Point tests at a dedicated database before app modules read settings.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://meet:meet@localhost:5432/meetscribe_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
# Long key avoids PyJWT's InsecureKeyLengthWarning in tests (not a real secret).
os.environ.setdefault("JWT_SECRET", "test-secret-key-that-is-at-least-32-bytes-long")

from app.api.deps import get_db, get_storage  # noqa: E402
from app.db import models  # noqa: E402,F401  (register tables on Base.metadata)
from app.db.base import Base  # noqa: E402
from app.main import create_app  # noqa: E402


class FakeStorage:
    """In-memory StorageService stand-in; no network calls in tests (AGENTS.md)."""

    def __init__(self) -> None:
        self.objects: dict[str, dict[str, object]] = {}
        self.deleted: list[str] = []

    def presign_put(self, key: str, content_type: str) -> str:
        return f"http://fake-s3/put/{key}?ct={content_type}"

    def presign_get(self, key: str) -> str:
        return f"http://fake-s3/get/{key}"

    def head_object(self, key: str) -> dict[str, object] | None:
        return self.objects.get(key)

    def object_exists(self, key: str) -> bool:
        return key in self.objects

    def delete_object(self, key: str) -> None:
        self.deleted.append(key)
        self.objects.pop(key, None)

    def put(self, key: str, **metadata: object) -> None:
        """Test helper simulating a completed browser upload."""
        self.objects[key] = {"ContentLength": 1, **metadata}


@pytest_asyncio.fixture
async def engine() -> AsyncIterator[object]:
    """Function-scoped engine bound to the current test's event loop."""
    eng = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine: object) -> AsyncIterator[AsyncSession]:
    """Function-scoped session; each test runs in a rolled-back transaction."""
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)  # type: ignore[arg-type]
    async with factory() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables(engine: object) -> AsyncIterator[None]:
    """Truncate all tables before each test so tests are independent."""
    async with engine.begin() as conn:  # type: ignore[attr-defined]
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
    yield


@pytest_asyncio.fixture(autouse=True)
async def _no_broker(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep tests off Redis: record enqueues instead of sending them (AGENTS.md rule 6)."""
    from app.services import meetings as meetings_service

    enqueued: list[str] = []
    monkeypatch.setattr(meetings_service, "enqueue_processing", enqueued.append)


@pytest_asyncio.fixture
async def fake_storage() -> FakeStorage:
    return FakeStorage()


@pytest_asyncio.fixture
async def app(db_session: AsyncSession, fake_storage: FakeStorage) -> AsyncIterator[FastAPI]:
    """App with the DB and storage dependencies overridden for tests."""
    application = create_app()

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    application.dependency_overrides[get_db] = _override_get_db
    application.dependency_overrides[get_storage] = lambda: fake_storage
    yield application
    application.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def credentials() -> dict[str, str]:
    return {"email": "user@example.com", "password": "supersecret123"}


@pytest_asyncio.fixture
async def registered_user(client: AsyncClient, credentials: dict[str, str]) -> dict[str, str]:
    resp = await client.post("/api/v1/auth/register", json=credentials)
    assert resp.status_code == 201, resp.text
    return credentials


@pytest_asyncio.fixture
async def auth_headers(
    client: AsyncClient, registered_user: dict[str, str]
) -> Iterator[dict[str, str]]:
    resp = await client.post("/api/v1/auth/login", json=registered_user)
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    yield {"Authorization": f"Bearer {token}"}
