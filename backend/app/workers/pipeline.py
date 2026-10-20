"""Processing pipeline stages (ARCHITECTURE.md).

Phase 3 ships the *skeleton*: every stage performs the real status/job bookkeeping but the
heavy lifting itself (ffmpeg, Whisper, LLM) is still a stub, added in Phases 4 and 5.

The pipeline core is async (`run_pipeline`), so tests can await it inside an existing event
loop. Celery task bodies are synchronous, so they wrap the core with `run_sync`, which owns
the event loop for that call.
"""

import asyncio
import contextlib
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.db.enums import JobStage, MeetingStatus
from app.db.models import Meeting
from app.db.session import engine
from app.services import jobs as jobs_service

logger = logging.getLogger(__name__)


class StageError(Exception):
    """Base class for stage failures."""


class TransientStageError(StageError):
    """Network/5xx/rate-limit style failure: worth retrying (ARCHITECTURE.md)."""


class PermanentStageError(StageError):
    """Bad input or unprocessable media: retrying will not help."""


@dataclass(frozen=True, slots=True)
class Stage:
    """One pipeline step: its job stage, the meeting status it implies, and its work."""

    name: JobStage
    sets_status: MeetingStatus
    run: Callable[[AsyncSession, Meeting], Awaitable[None]]


def run_sync(action: Callable[[AsyncSession], Awaitable[Any]]) -> Any:
    """Run async ORM work from a sync Celery caller on a private event loop.

    asyncpg connections are bound to the loop that created them, so the engine's pool is
    disposed when the loop closes (see the `finally`).
    """
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _inner() -> Any:
        async with factory() as session:
            return await action(session)

    async def _run_and_dispose() -> Any:
        try:
            return await _inner()
        finally:
            with contextlib.suppress(Exception):
                await engine.dispose()

    return asyncio.run(_run_and_dispose())


async def load_meeting(session: AsyncSession, meeting_id: uuid.UUID) -> Meeting:
    """Load a meeting or raise a permanent error if it no longer exists."""
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise PermanentStageError(f"Meeting {meeting_id} no longer exists")
    return meeting


async def set_status(
    session: AsyncSession,
    meeting: Meeting,
    status: MeetingStatus,
    error: str | None = None,
) -> None:
    """Commit a meeting status change together with its `jobs` row update."""
    meeting.status = status
    meeting.error_message = error

    job = await jobs_service.get_or_create_job(session, meeting.id)
    job.stage = status_to_stage(status).value
    if status is MeetingStatus.FAILED:
        await jobs_service.mark_failed(session, job, error or "processing failed")
    elif status is MeetingStatus.DONE:
        await jobs_service.mark_succeeded(session, job)
    else:
        await jobs_service.mark_running(session, job)
    await session.commit()


def status_to_stage(status: MeetingStatus) -> JobStage:
    """Map a meeting status to the job stage that produces it."""
    return {
        MeetingStatus.PREPARING: JobStage.PREPARE,
        MeetingStatus.TRANSCRIBING: JobStage.TRANSCRIBE,
        MeetingStatus.ANALYZING: JobStage.ANALYZE,
        MeetingStatus.DONE: JobStage.FINALIZE,
    }.get(status, JobStage.PREPARE)


async def _stub_prepare(session: AsyncSession, meeting: Meeting) -> None:
    """Phase 4 replaces this with download → ffmpeg normalize → upload normalized WAV."""
    logger.info("prepare_audio stub", extra={"meeting_id": str(meeting.id)})


async def _stub_transcribe(session: AsyncSession, meeting: Meeting) -> None:
    """Phase 4 replaces this with faster-whisper transcription and a `transcripts` row."""
    logger.info("transcribe stub", extra={"meeting_id": str(meeting.id)})


async def _stub_analyze(session: AsyncSession, meeting: Meeting) -> None:
    """Phase 5 replaces this with the LLM summary/decisions/action-items call."""
    logger.info("analyze stub", extra={"meeting_id": str(meeting.id)})


async def _stub_finalize(session: AsyncSession, meeting: Meeting) -> None:
    """Final stage: nothing to clean up yet; Phase 4 adds temp-file removal."""
    logger.info("finalize stub", extra={"meeting_id": str(meeting.id)})


def build_stages() -> list[Stage]:
    """The ordered pipeline, built per call so tests can monkeypatch stage functions."""
    return [
        Stage(JobStage.PREPARE, MeetingStatus.PREPARING, _stub_prepare),
        Stage(JobStage.TRANSCRIBE, MeetingStatus.TRANSCRIBING, _stub_transcribe),
        Stage(JobStage.ANALYZE, MeetingStatus.ANALYZING, _stub_analyze),
        Stage(JobStage.FINALIZE, MeetingStatus.DONE, _stub_finalize),
    ]


def stage_order() -> list[JobStage]:
    """Pipeline stage order (used by the progress mapping and tests)."""
    return [stage.name for stage in build_stages()]


async def run_stage(session: AsyncSession, meeting: Meeting, stage: Stage) -> None:
    """Enter a stage and run its work.

    A `PermanentStageError` marks the meeting `failed` here. A `TransientStageError` is
    left for the caller to retry, so the meeting keeps its in-progress status (which the
    retry re-enters) rather than looking permanently broken while retries are pending.
    """
    await set_status(session, meeting, stage.sets_status)
    try:
        await stage.run(session, meeting)
    except PermanentStageError as exc:
        await set_status(session, meeting, MeetingStatus.FAILED, str(exc))
        raise
    except TransientStageError:
        raise


async def run_pipeline(
    session: AsyncSession,
    meeting_id: uuid.UUID,
    *,
    stages: list[JobStage] | None = None,
) -> list[str]:
    """Run the pipeline stages for one meeting on the caller's session.

    Raises `StageError` on the first failure; the caller decides retry vs. fail. The
    meeting's status is updated as each stage is entered, so a re-run resumes safely.
    """
    ordered = stages if stages is not None else [stage.name for stage in build_stages()]
    for stage_name in ordered:
        stage = next(s for s in build_stages() if s.name is stage_name)
        meeting = await load_meeting(session, meeting_id)
        await run_stage(session, meeting, stage)
        await session.commit()
    return [stage.value for stage in ordered]


def pipeline_settings_snapshot() -> dict[str, int]:
    """Settings the pipeline depends on; handy for logging and debugging."""
    settings = get_settings()
    return {
        "max_retries": settings.pipeline_max_retries,
        "stuck_minutes": settings.stuck_meeting_minutes,
    }
