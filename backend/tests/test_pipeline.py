"""Pipeline tests (Phase 3/4): stage transitions, retries, stuck sweep, status API.

The async core (`pipeline.run_pipeline`) is awaited directly on the test session, with a
fake `StageContext` so no ffmpeg, Whisper, or S3 is touched. Retry orchestration is
exercised through the sync driver `tasks.run_pipeline`. No Celery broker or Redis is used.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import JobStage, JobStatus, MeetingStatus
from app.db.models import Job, Meeting, Transcript, User
from app.services.storage import audio_object_key, normalized_object_key
from app.workers import pipeline, tasks
from tests.conftest import FakeStorage


async def make_meeting(
    session: AsyncSession,
    storage: FakeStorage,
    status: MeetingStatus = MeetingStatus.QUEUED,
) -> Meeting:
    """Create a meeting with an uploaded object in fake S3 so `prepare` can run."""
    user = User(email=f"{uuid.uuid4()}@example.com", password_hash="x")
    session.add(user)
    await session.flush()
    meeting = Meeting(
        user_id=user.id,
        title="t",
        original_filename="t.mp3",
        content_type="audio/mpeg",
        size_bytes=10,
        status=status,
    )
    session.add(meeting)
    await session.flush()

    key = audio_object_key(str(user.id), str(meeting.id), "t.mp3")
    meeting.audio_key = key
    storage.uploads[key] = b"fake-mp3-bytes"
    storage.objects[key] = {"ContentLength": 14}
    await session.commit()
    return meeting


async def test_pipeline_runs_all_stages_in_order(
    db_session: AsyncSession, fake_storage: FakeStorage, stage_context: pipeline.StageContext
) -> None:
    meeting = await make_meeting(db_session, fake_storage)
    ran = await pipeline.run_pipeline(db_session, meeting.id, ctx=stage_context)
    assert ran == ["prepare", "transcribe", "analyze", "finalize"]

    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status is MeetingStatus.DONE
    assert refreshed.error_message is None


async def test_prepare_normalizes_and_records_duration(
    db_session: AsyncSession,
    fake_storage: FakeStorage,
    stage_context: pipeline.StageContext,
) -> None:
    meeting = await make_meeting(db_session, fake_storage)
    await pipeline.run_pipeline(
        db_session, meeting.id, stages=[JobStage.PREPARE], ctx=stage_context
    )

    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    expected_key = normalized_object_key(str(refreshed.user_id), str(refreshed.id))
    assert refreshed.normalized_key == expected_key
    assert expected_key in fake_storage.objects  # uploaded to S3
    assert refreshed.duration_sec == 90.0


async def test_transcribe_saves_merged_transcript(
    db_session: AsyncSession,
    fake_storage: FakeStorage,
    stage_context: pipeline.StageContext,
) -> None:
    meeting = await make_meeting(db_session, fake_storage)
    await pipeline.run_pipeline(db_session, meeting.id, ctx=stage_context)

    transcript = await db_session.get(Transcript, meeting.id)
    assert transcript is not None
    assert transcript.model == "fake-whisper"
    assert transcript.segments  # non-empty
    assert "chunk_000.wav part 1" in transcript.full_text

    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.language == "en"


async def test_transcribe_applies_chunk_offsets(
    db_session: AsyncSession,
    fake_storage: FakeStorage,
    fake_audio: object,
    fake_transcriber: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A 2-chunk recording must have its second chunk's segments offset correctly."""
    # Force two chunks: duration 3600 s, chunk window 1800 s.
    from app.workers.pipeline import StageContext
    from tests.conftest import FakeAudioService, FakeTranscriber

    assert isinstance(fake_audio, FakeAudioService)
    assert isinstance(fake_transcriber, FakeTranscriber)
    fake_audio.duration_sec = 3600.0
    monkeypatch.setattr(
        "app.workers.pipeline.get_settings",
        lambda: type(
            "S",
            (),
            {
                "audio_chunk_seconds": 1800,
                "transcribe_language": "",
                "worker_temp_dir": "/tmp/meetscribe",
            },
        )(),
    )

    meeting = await make_meeting(db_session, fake_storage)
    ctx = StageContext(storage=fake_storage, audio=fake_audio, transcriber=fake_transcriber)
    await pipeline.run_pipeline(db_session, meeting.id, ctx=ctx)

    transcript = await db_session.get(Transcript, meeting.id)
    assert transcript is not None
    assert len(transcript.segments) == 4  # 2 chunks x 2 segments
    # Second chunk starts at 1800 s, so its first segment is at 0 + 1800.
    starts = [round(seg["start"], 3) for seg in transcript.segments]
    assert starts == [0.0, 6.0, 1800.0, 1806.0]


async def test_pipeline_records_job_rows(
    db_session: AsyncSession, fake_storage: FakeStorage, stage_context: pipeline.StageContext
) -> None:
    meeting = await make_meeting(db_session, fake_storage)
    await pipeline.run_pipeline(db_session, meeting.id, ctx=stage_context)

    job = (
        (await db_session.execute(select(Job).where(Job.meeting_id == meeting.id))).scalars().one()
    )
    assert job.status is JobStatus.SUCCEEDED
    assert job.stage == JobStage.FINALIZE.value
    assert job.started_at is not None
    assert job.finished_at is not None
    assert job.error is None


async def test_pipeline_is_idempotent(
    db_session: AsyncSession, fake_storage: FakeStorage, stage_context: pipeline.StageContext
) -> None:
    meeting = await make_meeting(db_session, fake_storage)
    await pipeline.run_pipeline(db_session, meeting.id, ctx=stage_context)
    await pipeline.run_pipeline(db_session, meeting.id, ctx=stage_context)  # re-run must be safe

    jobs = (
        (await db_session.execute(select(Job).where(Job.meeting_id == meeting.id))).scalars().all()
    )
    assert len(jobs) == 1
    transcripts = (
        (await db_session.execute(select(Transcript).where(Transcript.meeting_id == meeting.id)))
        .scalars()
        .all()
    )
    assert len(transcripts) == 1
    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status is MeetingStatus.DONE


async def test_reprepare_skips_existing_normalized_object(
    db_session: AsyncSession, fake_storage: FakeStorage, fake_audio: object
) -> None:
    """A second prepare must not re-download or re-normalize (idempotency, D34)."""
    from app.workers.pipeline import StageContext
    from tests.conftest import FakeAudioService

    assert isinstance(fake_audio, FakeAudioService)
    audio = fake_audio
    transcriber = type(
        "T",
        (),
        {"model_name": "fake", "transcribe": lambda self, p, lang=None: None},
    )()
    ctx = StageContext(storage=fake_storage, audio=audio, transcriber=transcriber)  # type: ignore[arg-type]

    meeting = await make_meeting(db_session, fake_storage)
    await pipeline.run_pipeline(db_session, meeting.id, stages=[JobStage.PREPARE], ctx=ctx)
    first_normalize_count = len(audio.normalized)
    await pipeline.run_pipeline(db_session, meeting.id, stages=[JobStage.PREPARE], ctx=ctx)

    assert len(audio.normalized) == first_normalize_count  # no second normalize


async def test_each_stage_sets_its_status(
    db_session: AsyncSession,
    fake_storage: FakeStorage,
    stage_context: pipeline.StageContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    meeting = await make_meeting(db_session, fake_storage)
    seen: list[MeetingStatus] = []
    real_run_stage = pipeline.run_stage

    async def spy(
        session: AsyncSession,
        m: Meeting,
        stage: pipeline.Stage,
        ctx: pipeline.StageContext | None = None,
    ) -> None:
        seen.append(stage.sets_status)
        await real_run_stage(session, m, stage, ctx)

    monkeypatch.setattr(pipeline, "run_stage", spy)
    await pipeline.run_pipeline(db_session, meeting.id, ctx=stage_context)

    assert seen == [
        MeetingStatus.PREPARING,
        MeetingStatus.TRANSCRIBING,
        MeetingStatus.ANALYZING,
        MeetingStatus.DONE,
    ]


async def test_permanent_error_marks_failed(
    db_session: AsyncSession,
    fake_storage: FakeStorage,
    stage_context: pipeline.StageContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    meeting = await make_meeting(db_session, fake_storage)

    async def broken(session: AsyncSession, m: Meeting, ctx: pipeline.StageContext) -> None:
        raise pipeline.PermanentStageError("corrupt audio")

    monkeypatch.setattr(pipeline, "_stage_transcribe", broken)

    with pytest.raises(pipeline.PermanentStageError):
        await pipeline.run_pipeline(db_session, meeting.id, ctx=stage_context)

    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status is MeetingStatus.FAILED
    assert refreshed.error_message == "corrupt audio"


async def test_missing_audio_is_permanent(
    db_session: AsyncSession, fake_storage: FakeStorage, stage_context: pipeline.StageContext
) -> None:
    meeting = await make_meeting(db_session, fake_storage)
    meeting.audio_key = None
    await db_session.commit()

    with pytest.raises(pipeline.PermanentStageError):
        await pipeline.run_pipeline(
            db_session, meeting.id, stages=[JobStage.PREPARE], ctx=stage_context
        )

    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status is MeetingStatus.FAILED


def _seed_meeting_sync(status: MeetingStatus, *, age_minutes: int = 0) -> uuid.UUID:
    """Create a meeting on a private loop (for the sync-path sweep tests)."""

    async def seed(session: AsyncSession) -> uuid.UUID:
        user = User(email=f"{uuid.uuid4()}@example.com", password_hash="x")
        session.add(user)
        await session.flush()
        meeting = Meeting(
            user_id=user.id,
            title="t",
            original_filename="t.mp3",
            content_type="audio/mpeg",
            size_bytes=1,
            status=status,
        )
        session.add(meeting)
        await session.flush()
        if age_minutes:
            meeting.updated_at = datetime.now(UTC) - timedelta(minutes=age_minutes)
        await session.commit()
        return meeting.id

    return uuid.UUID(str(pipeline.run_sync(seed)))


def _read_status_sync(meeting_id: uuid.UUID) -> tuple[MeetingStatus, str | None]:
    async def read(session: AsyncSession) -> tuple[MeetingStatus, str | None]:
        meeting = await session.get(Meeting, meeting_id)
        assert meeting is not None
        return meeting.status, meeting.error_message

    result = pipeline.run_sync(read)
    return result  # type: ignore[return-value]


def test_sweep_stuck_meetings_fails_old_ones() -> None:
    stuck = _seed_meeting_sync(MeetingStatus.TRANSCRIBING, age_minutes=90)
    fresh = _seed_meeting_sync(MeetingStatus.TRANSCRIBING)

    swept = tasks.sweep_stuck_meetings()
    assert swept == 1

    stuck_status, stuck_error = _read_status_sync(stuck)
    fresh_status, _ = _read_status_sync(fresh)
    assert stuck_status is MeetingStatus.FAILED
    assert "timed out" in (stuck_error or "")
    assert fresh_status is MeetingStatus.TRANSCRIBING


def test_sweep_ignores_terminal_meetings() -> None:
    done = _seed_meeting_sync(MeetingStatus.DONE, age_minutes=90)

    assert tasks.sweep_stuck_meetings() == 0
    status, _ = _read_status_sync(done)
    assert status is MeetingStatus.DONE


async def test_status_endpoint_reports_progress(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/v1/meetings",
        json={"filename": "a.mp3", "content_type": "audio/mpeg", "size_bytes": 10},
        headers=auth_headers,
    )
    meeting_id = created.json()["meeting_id"]

    resp = await client.get(f"/api/v1/meetings/{meeting_id}/status", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "pending_upload"
    assert body["progress_pct"] == 0
    assert body["stage"] is None


async def test_status_endpoint_progress_by_status() -> None:
    from app.services.meetings import progress_pct

    expected = {
        MeetingStatus.PENDING_UPLOAD: 0,
        MeetingStatus.QUEUED: 5,
        MeetingStatus.PREPARING: 15,
        MeetingStatus.TRANSCRIBING: 15,
        MeetingStatus.ANALYZING: 70,
        MeetingStatus.DONE: 100,
        MeetingStatus.FAILED: 0,
    }
    for status, pct in expected.items():
        fake = Meeting(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            title="t",
            original_filename="t.mp3",
            content_type="audio/mpeg",
            size_bytes=1,
            status=status,
        )
        assert progress_pct(fake) == pct


async def test_status_endpoint_requires_ownership(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/v1/meetings",
        json={"filename": "a.mp3", "content_type": "audio/mpeg", "size_bytes": 10},
        headers=auth_headers,
    )
    meeting_id = created.json()["meeting_id"]

    await client.post(
        "/api/v1/auth/register",
        json={"email": "other3@example.com", "password": "supersecret123"},
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "other3@example.com", "password": "supersecret123"},
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.get(f"/api/v1/meetings/{meeting_id}/status", headers=other_headers)
    assert resp.status_code == 404


# ------------------------------------------------------------------ sync driver path


def _sync_ctx(storage: FakeStorage, audio: object, transcriber: object) -> pipeline.StageContext:
    return pipeline.StageContext(storage=storage, audio=audio, transcriber=transcriber)  # type: ignore[arg-type]


def test_sync_driver_completes_pipeline(fake_storage: FakeStorage) -> None:
    """The sync Celery-facing driver runs the whole pipeline on its own event loop."""
    from tests.conftest import FakeAudioService, FakeTranscriber

    async def seed(session: AsyncSession) -> uuid.UUID:
        meeting = await make_meeting(session, fake_storage)
        return meeting.id

    meeting_id = uuid.UUID(str(pipeline.run_sync(seed)))
    ctx = _sync_ctx(fake_storage, FakeAudioService(), FakeTranscriber())

    ran = tasks.run_pipeline(meeting_id, ctx=ctx, stages=[JobStage.PREPARE, JobStage.FINALIZE])
    assert ran == ["prepare", "finalize"]


def test_sync_driver_requests_retry_on_transient(
    fake_storage: FakeStorage, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tests.conftest import FakeAudioService, FakeTranscriber

    async def seed(session: AsyncSession) -> uuid.UUID:
        meeting = await make_meeting(session, fake_storage)
        return meeting.id

    meeting_id = uuid.UUID(str(pipeline.run_sync(seed)))
    monkey_settings = type(
        "S", (), {"pipeline_max_retries": 3, "stuck_meeting_minutes": 60, "audio_chunk_seconds": 60}
    )()
    monkeypatch.setattr("app.workers.tasks.get_settings", lambda: monkey_settings)

    async def flaky(session: AsyncSession, m: Meeting, ctx: pipeline.StageContext) -> None:
        raise pipeline.TransientStageError("rate limited")

    monkeypatch.setattr(pipeline, "_stage_prepare", flaky)
    captured: dict[str, object] = {}

    def fake_retry(**kwargs: object) -> BaseException:
        captured.update(kwargs)
        return RuntimeError("retry requested")

    ctx = _sync_ctx(fake_storage, FakeAudioService(), FakeTranscriber())
    with pytest.raises(RuntimeError, match="retry requested"):
        tasks.run_pipeline(meeting_id, ctx=ctx, on_retry=fake_retry)

    assert captured["countdown"] == 30
    assert isinstance(captured["exc"], pipeline.TransientStageError)
