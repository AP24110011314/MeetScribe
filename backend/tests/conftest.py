"""Shared pytest fixtures: a real Postgres test DB, isolated per test.

Each test gets its own engine bound to its own event loop (pytest-asyncio runs a fresh
loop per test), with `NullPool` so no connection is shared across loops. The schema is
created by running the migrations once per session.
"""

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

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
from app.services.audio import AudioChunk, expected_chunk_count  # noqa: E402
from app.services.transcription import Segment, TranscriptResult  # noqa: E402
from app.workers.pipeline import StageContext  # noqa: E402


class FakeStorage:
    """In-memory StorageService stand-in; no network calls in tests (AGENTS.md)."""

    def __init__(self) -> None:
        self.objects: dict[str, dict[str, object]] = {}
        self.deleted: list[str] = []
        self.uploads: dict[str, bytes] = {}

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
        self.uploads.pop(key, None)

    def download_to_file(self, key: str, destination: Path) -> None:
        if key not in self.objects:
            raise FileNotFoundError(f"No such object: {key}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(self.uploads.get(key, b""))

    def upload_file(self, key: str, source: Path, content_type: str) -> None:
        self.uploads[key] = source.read_bytes()
        self.objects[key] = {"ContentLength": source.stat().st_size, "ContentType": content_type}

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


class FakeAudioService:
    """Deterministic AudioService stand-in: no ffmpeg, no real media needed (AGENTS.md)."""

    def __init__(self, *, duration_sec: float = 90.0) -> None:
        self.duration_sec = duration_sec
        self.normalized: list[Path] = []
        self.chunked: list[Path] = []

    def probe_duration(self, path: Path) -> float:
        return self.duration_sec

    def normalize(self, source: Path, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"RIFF-fake-wav")
        self.normalized.append(destination)

    def chunk(self, source: Path, workdir: Path, *, chunk_seconds: int) -> list[AudioChunk]:
        workdir.mkdir(parents=True, exist_ok=True)
        self.chunked.append(source)
        count = expected_chunk_count(self.duration_sec, chunk_seconds)
        chunks: list[AudioChunk] = []
        for index in range(count):
            path = workdir / f"chunk_{index:03d}.wav"
            path.write_bytes(b"RIFF-fake-wav")
            chunks.append(AudioChunk(path=path, start_sec=index * chunk_seconds, index=index))
        return chunks


class FakeTranscriber:
    """Deterministic Transcriber stand-in; never downloads a model (D7)."""

    def __init__(self, *, language: str = "en", seconds_per_chunk: float = 12.0) -> None:
        self.language = language
        self.seconds_per_chunk = seconds_per_chunk
        self.calls: list[tuple[Path, str | None]] = []

    @property
    def model_name(self) -> str:
        return "fake-whisper"

    def transcribe(self, wav_path: Path, language: str | None = None) -> TranscriptResult:
        self.calls.append((wav_path, language))
        # Two segments per chunk; the pipeline is responsible for applying offsets.
        return TranscriptResult(
            language=self.language,
            duration=self.seconds_per_chunk,
            segments=[
                Segment(start=0.0, end=self.seconds_per_chunk / 2, text=f"{wav_path.name} part 1"),
                Segment(
                    start=self.seconds_per_chunk / 2,
                    end=self.seconds_per_chunk,
                    text=f"{wav_path.name} part 2",
                ),
            ],
        )


@pytest_asyncio.fixture
async def fake_audio() -> FakeAudioService:
    return FakeAudioService()


@pytest_asyncio.fixture
async def fake_transcriber() -> FakeTranscriber:
    return FakeTranscriber()


@pytest_asyncio.fixture
async def stage_context(
    fake_storage: FakeStorage,
    fake_audio: FakeAudioService,
    fake_transcriber: FakeTranscriber,
) -> StageContext:
    """A StageContext wired to fakes: no ffmpeg, Whisper, or S3 in unit tests."""
    return StageContext(storage=fake_storage, audio=fake_audio, transcriber=fake_transcriber)


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
