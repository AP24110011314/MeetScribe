"""Celery tasks (ARCHITECTURE.md pipeline + reliability rules).

`process_meeting` walks the four stages in order, updating `meetings.status` and the `jobs`
row as it goes. It is idempotent: re-running it re-enters stages safely. Transient
failures retry with bounded exponential backoff; permanent failures mark the meeting
`failed` at once.

The retry orchestration lives in the sync `run_pipeline` wrapper so it can drive Celery's
`self.retry`; the per-stage async core (`pipeline.run_pipeline`) is exercised directly by
tests.
"""

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.enums import JobStage, MeetingStatus
from app.db.models import Job, Meeting
from app.workers import pipeline
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_stages(
    meeting_id: uuid.UUID,
    stages: list[JobStage] | None,
) -> list[str]:
    """Run the async pipeline core in a private event loop (sync Celery context)."""

    async def action(session: AsyncSession) -> list[str]:
        return await pipeline.run_pipeline(session, meeting_id, stages=stages)

    return list(pipeline.run_sync(action))


def _fail_meeting(meeting_id: uuid.UUID, message: str) -> None:
    """Error-path helper: mark a meeting failed (best effort)."""

    async def action(session: AsyncSession) -> None:
        meeting = await session.get(Meeting, meeting_id)
        if meeting is None or meeting.status is MeetingStatus.FAILED:
            return
        await pipeline.set_status(session, meeting, MeetingStatus.FAILED, message)

    pipeline.run_sync(action)


def _record_error(meeting_id: uuid.UUID, message: str) -> None:
    """Record a retryable failure on the job row without changing the meeting status."""

    async def action(session: AsyncSession) -> None:
        job = (
            (await session.execute(select(Job).where(Job.meeting_id == meeting_id)))
            .scalars()
            .first()
        )
        if job is None:
            return
        job.error = message
        await session.commit()

    pipeline.run_sync(action)


def run_pipeline(
    meeting_id: uuid.UUID,
    *,
    stages: list[JobStage] | None = None,
    on_retry: Callable[..., BaseException] | None = None,
) -> list[str]:
    """Sync pipeline driver with retry handling; broker-agnostic via `on_retry`.

    Transient failures: record the error, then either ask Celery to retry (`on_retry`) or
    fail the meeting. Permanent failures fail the meeting immediately.
    """
    settings = get_settings()
    ordered = stages if stages is not None else pipeline.stage_order()

    for index, stage_name in enumerate(ordered):
        remaining = ordered[index:]
        try:
            return _run_stages(meeting_id, remaining)
        except pipeline.PermanentStageError as exc:
            logger.warning(
                "Pipeline stage failed permanently",
                extra={"meeting_id": str(meeting_id), "stage": stage_name.value},
            )
            _fail_meeting(meeting_id, str(exc))
            raise
        except pipeline.TransientStageError as exc:
            logger.warning(
                "Pipeline stage failed transiently",
                extra={"meeting_id": str(meeting_id), "stage": stage_name.value},
            )
            _record_error(meeting_id, str(exc))
            if on_retry is not None:
                countdown = min(2**index * 30, settings.pipeline_max_retries * 60)
                # Celery's `retry` raises `Retry`; chain so the cause is not masked.
                raise on_retry(exc=exc, countdown=countdown) from exc
            _fail_meeting(meeting_id, str(exc))
            raise
    return []


@celery_app.task(
    bind=True,
    name="app.workers.tasks.process_meeting",
    max_retries=get_settings().pipeline_max_retries,
    acks_late=True,
)
def process_meeting(self: object, meeting_id: str) -> list[str]:
    """Celery entry point for the processing pipeline."""
    retry = getattr(self, "retry", None)
    try:
        return run_pipeline(uuid.UUID(meeting_id), on_retry=retry)
    except pipeline.PermanentStageError:
        return []  # already marked failed; retrying cannot help
    except pipeline.TransientStageError:
        raise  # `on_retry` raised a Retry, or the meeting was marked failed
    except Exception as exc:
        logger.exception("process_meeting crashed", extra={"meeting_id": meeting_id})
        _fail_meeting(uuid.UUID(meeting_id), str(exc))
        raise


@celery_app.task(name="app.workers.tasks.sweep_stuck_meetings")
def sweep_stuck_meetings() -> int:
    """Beat task: fail meetings stuck in a processing state for over the threshold."""
    threshold_minutes = get_settings().stuck_meeting_minutes

    async def action(session: AsyncSession) -> int:
        cutoff = datetime.now(UTC) - timedelta(minutes=threshold_minutes)
        in_flight = [
            MeetingStatus.QUEUED,
            MeetingStatus.PREPARING,
            MeetingStatus.TRANSCRIBING,
            MeetingStatus.ANALYZING,
        ]
        stmt = select(Meeting).where(Meeting.status.in_(in_flight), Meeting.updated_at < cutoff)
        stale = list((await session.execute(stmt)).scalars().all())
        for meeting in stale:
            await pipeline.set_status(
                session,
                meeting,
                MeetingStatus.FAILED,
                f"Processing timed out after {threshold_minutes} minutes",
            )
        if stale:
            logger.warning("Swept stuck meetings", extra={"count": len(stale)})
        return len(stale)

    return int(pipeline.run_sync(action))
