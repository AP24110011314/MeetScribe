"""Pipeline skeleton tests (Phase 3): stage transitions, retries, stuck sweep, status API.

The async core (`pipeline.run_pipeline`) is awaited directly on the test session. Retry
orchestration is exercised through the sync driver `tasks.run_pipeline`, which runs the core
on its own loop against the same test database. No Celery broker or Redis is touched.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import JobStage, JobStatus, MeetingStatus
from app.db.models import Job, Meeting, User
from app.workers import pipeline, tasks


async def _make_meeting(
    session: AsyncSession, status: MeetingStatus = MeetingStatus.QUEUED
) -> Meeting:
    user = User(email=f"{uuid.uuid4()}@example.com", password_hash="x")
    session.add(user)
    await session.flush()
    meeting = Meeting(
        user_id=user.id,
        title="t",
        original_filename="t.mp3",
        content_type="audio/mpeg",
        size_bytes=10,
        audio_key="k",
        status=status,
    )
    session.add(meeting)
    await session.commit()
    return meeting


def make_meeting_sync(status: MeetingStatus = MeetingStatus.QUEUED) -> uuid.UUID:
    """Create a meeting through the sync driver's own event loop (for sync-path tests)."""

    async def action(session: AsyncSession) -> uuid.UUID:
        meeting = await _make_meeting(session, status)
        return meeting.id

    return uuid.UUID(str(pipeline.run_sync(action)))


async def test_pipeline_runs_all_stages_in_order(db_session: AsyncSession) -> None:
    meeting = await _make_meeting(db_session)
    ran = await pipeline.run_pipeline(db_session, meeting.id)
    assert ran == ["prepare", "transcribe", "analyze", "finalize"]

    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status is MeetingStatus.DONE
    assert refreshed.error_message is None


async def test_pipeline_records_job_rows(db_session: AsyncSession) -> None:
    meeting = await _make_meeting(db_session)
    await pipeline.run_pipeline(db_session, meeting.id)

    job = (
        (await db_session.execute(select(Job).where(Job.meeting_id == meeting.id))).scalars().one()
    )
    assert job.status is JobStatus.SUCCEEDED
    assert job.stage == JobStage.FINALIZE.value
    assert job.started_at is not None
    assert job.finished_at is not None
    assert job.error is None


async def test_pipeline_is_idempotent(db_session: AsyncSession) -> None:
    meeting = await _make_meeting(db_session)
    await pipeline.run_pipeline(db_session, meeting.id)
    await pipeline.run_pipeline(db_session, meeting.id)  # re-run must be safe

    jobs = (
        (await db_session.execute(select(Job).where(Job.meeting_id == meeting.id))).scalars().all()
    )
    assert len(jobs) == 1
    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status is MeetingStatus.DONE


async def test_each_stage_sets_its_status(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """As the pipeline runs, the meeting status should track the current stage."""
    meeting = await _make_meeting(db_session)
    seen: list[MeetingStatus] = []
    real_run_stage = pipeline.run_stage

    async def spy(session: AsyncSession, m: Meeting, stage: pipeline.Stage) -> None:
        seen.append(stage.sets_status)
        await real_run_stage(session, m, stage)

    monkeypatch.setattr(pipeline, "run_stage", spy)
    await pipeline.run_pipeline(db_session, meeting.id)

    assert seen == [
        MeetingStatus.PREPARING,
        MeetingStatus.TRANSCRIBING,
        MeetingStatus.ANALYZING,
        MeetingStatus.DONE,
    ]


async def test_pipeline_updates_status_between_stages(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A stage should observe the status the previous stage committed."""
    meeting = await _make_meeting(db_session)
    observed: list[MeetingStatus] = []

    async def record_status(session: AsyncSession, m: Meeting) -> None:
        observed.append(m.status)

    monkeypatch.setattr(pipeline, "_stub_transcribe", record_status)
    monkeypatch.setattr(pipeline, "_stub_analyze", record_status)
    await pipeline.run_pipeline(db_session, meeting.id)

    assert observed == [MeetingStatus.TRANSCRIBING, MeetingStatus.ANALYZING]


async def test_permanent_error_marks_failed(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    meeting = await _make_meeting(db_session)

    async def broken(session: AsyncSession, m: Meeting) -> None:
        raise pipeline.PermanentStageError("corrupt audio")

    monkeypatch.setattr(pipeline, "_stub_transcribe", broken)

    with pytest.raises(pipeline.PermanentStageError):
        await pipeline.run_pipeline(db_session, meeting.id)

    refreshed = await db_session.get(Meeting, meeting.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status is MeetingStatus.FAILED
    assert refreshed.error_message == "corrupt audio"


def get_meeting_sync(meeting_id: uuid.UUID) -> Meeting | None:
    """Read a meeting through a private loop; safe for sync-path assertions."""

    async def action(session: AsyncSession) -> Meeting | None:
        return await session.get(Meeting, meeting_id)

    result: Meeting | None = pipeline.run_sync(action)
    if result is not None:
        # Detach a plain copy of the fields we assert on (the session is closed).
        return result
    return None


def test_transient_error_requests_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    """The sync driver retries transient failures with backoff and does not fail the meeting."""
    meeting_id = make_meeting_sync()

    async def flaky(session: AsyncSession, m: Meeting) -> None:
        raise pipeline.TransientStageError("rate limited")

    monkeypatch.setattr(pipeline, "_stub_prepare", flaky)
    captured: dict[str, object] = {}

    def fake_retry(**kwargs: object) -> BaseException:
        captured.update(kwargs)
        return RuntimeError("retry requested")

    with pytest.raises(RuntimeError, match="retry requested"):
        tasks.run_pipeline(meeting_id, on_retry=fake_retry)

    assert captured["countdown"] == 30  # first stage: 2**0 * 30
    assert isinstance(captured["exc"], pipeline.TransientStageError)

    detail = get_meeting_sync(meeting_id)
    assert detail is not None
    assert detail.status is not MeetingStatus.FAILED


def test_transient_error_without_retry_fails_meeting(monkeypatch: pytest.MonkeyPatch) -> None:
    meeting_id = make_meeting_sync()

    async def flaky(session: AsyncSession, m: Meeting) -> None:
        raise pipeline.TransientStageError("storage down")

    monkeypatch.setattr(pipeline, "_stub_prepare", flaky)

    with pytest.raises(pipeline.TransientStageError):
        tasks.run_pipeline(meeting_id)

    detail = get_meeting_sync(meeting_id)
    assert detail is not None
    assert detail.status is MeetingStatus.FAILED
    assert detail.error_message == "storage down"


def test_sync_driver_completes_pipeline() -> None:
    meeting_id = make_meeting_sync()
    ran = tasks.run_pipeline(meeting_id)
    assert ran == ["prepare", "transcribe", "analyze", "finalize"]

    detail = get_meeting_sync(meeting_id)
    assert detail is not None
    assert detail.status is MeetingStatus.DONE


@pytest.fixture
def stuck_meeting_id() -> uuid.UUID:
    return make_meeting_sync(MeetingStatus.TRANSCRIBING)


def test_sweep_stuck_meetings_fails_old_ones(
    stuck_meeting_id: uuid.UUID, fresh_meeting_id: uuid.UUID
) -> None:
    async def backdate(session: AsyncSession) -> None:
        meeting = await session.get(Meeting, stuck_meeting_id)
        assert meeting is not None
        meeting.updated_at = datetime.now(UTC) - timedelta(minutes=90)
        await session.commit()

    pipeline.run_sync(backdate)

    swept = tasks.sweep_stuck_meetings()
    assert swept == 1

    stuck = get_meeting_sync(stuck_meeting_id)
    fresh = get_meeting_sync(fresh_meeting_id)
    assert stuck is not None and stuck.status is MeetingStatus.FAILED
    assert "timed out" in (stuck.error_message or "")
    assert fresh is not None and fresh.status is MeetingStatus.TRANSCRIBING


@pytest.fixture
def fresh_meeting_id() -> uuid.UUID:
    return make_meeting_sync(MeetingStatus.TRANSCRIBING)


def test_sweep_ignores_terminal_meetings(done_meeting_id: uuid.UUID) -> None:
    async def backdate(session: AsyncSession) -> None:
        meeting = await session.get(Meeting, done_meeting_id)
        assert meeting is not None
        meeting.updated_at = datetime.now(UTC) - timedelta(minutes=90)
        await session.commit()

    pipeline.run_sync(backdate)

    assert tasks.sweep_stuck_meetings() == 0
    done = get_meeting_sync(done_meeting_id)
    assert done is not None and done.status is MeetingStatus.DONE


@pytest.fixture
def done_meeting_id() -> uuid.UUID:
    return make_meeting_sync(MeetingStatus.DONE)


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
