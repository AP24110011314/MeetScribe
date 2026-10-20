"""Job bookkeeping for the processing pipeline (docs/DATABASE.md `jobs` table).

Workers call these helpers; they never touch routers. Every helper is safe to call again
after a retry, so Celery tasks stay idempotent (AGENTS.md rule 6).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import JobStage, JobStatus
from app.db.models import Job


async def get_or_create_job(session: AsyncSession, meeting_id: uuid.UUID) -> Job:
    """Return the meeting's current job, creating a `queued` one when none exists."""
    stmt = select(Job).where(Job.meeting_id == meeting_id).order_by(Job.stage)
    job = (await session.execute(stmt)).scalars().first()
    if job is not None:
        return job

    job = Job(meeting_id=meeting_id, stage=JobStage.PREPARE.value, status=JobStatus.QUEUED)
    session.add(job)
    await session.flush()
    return job


async def mark_running(session: AsyncSession, job: Job, stage: JobStage | None = None) -> None:
    """Mark a job as running (and record its stage) before the work starts."""
    job.status = JobStatus.RUNNING
    if stage is not None:
        job.stage = stage.value
    job.started_at = job.started_at or datetime.now(UTC)
    job.attempts += 1
    job.error = None
    await session.flush()


async def mark_succeeded(session: AsyncSession, job: Job) -> None:
    """Mark a job as succeeded and stamp its finish time."""
    job.status = JobStatus.SUCCEEDED
    job.finished_at = datetime.now(UTC)
    await session.flush()


async def mark_failed(session: AsyncSession, job: Job, error: str) -> None:
    """Mark a job as failed and store the internal error detail."""
    job.status = JobStatus.FAILED
    job.error = error
    job.finished_at = datetime.now(UTC)
    await session.flush()
