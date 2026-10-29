import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from celery import Task
from sqlalchemy import func, update

from app.db.models import Job, Meeting
from app.db.session import get_sync_db
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    name="app.workers.tasks.process_meeting",
    acks_late=True,
    max_retries=3,
    default_retry_delay=5,
)
def process_meeting(self: Task, meeting_id_str: str) -> dict[str, Any]:
    """
    Main processing pipeline for meeting audio:
    1. prepare_audio: ffmpeg normalize to 16kHz mono, chunking
    2. transcribe: Whisper speech-to-text
    3. analyze: LLM summary, decisions, action items
    4. finalize: save notes and mark meeting done

    In Phase 3, this implements the idempotent pipeline skeleton with stub stages.
    Phases 4 and 5 plug in the real audio, transcription, and LLM services.
    """
    meeting_uuid = uuid.UUID(meeting_id_str)
    session = get_sync_db()
    job_id: uuid.UUID | None = None

    try:
        # 1. Idempotent claim: atomically transition from queued/failed to preparing
        stmt = (
            update(Meeting)
            .where(
                Meeting.id == meeting_uuid,
                Meeting.status.in_(["queued", "failed"]),
            )
            .values(
                status="preparing",
                stage="audio_processing",
                progress_pct=15.0,
                process_attempts=Meeting.process_attempts + 1,
                error_message=None,
                updated_at=func.now(),
            )
            .returning(Meeting)
        )
        meeting = session.execute(stmt).scalar_one_or_none()

        if not meeting:
            logger.info(
                "Meeting %s could not be claimed (already processing, done, or not found)",
                meeting_id_str,
            )
            return {"status": "skipped", "meeting_id": meeting_id_str}

        # 2. Record Job execution
        job = Job(
            meeting_id=meeting.id,
            celery_task_id=self.request.id if self.request else None,
            stage="audio_processing",
            status="processing",
            attempts=meeting.process_attempts,
            started_at=datetime.now(timezone.utc),
        )
        session.add(job)
        session.commit()
        job_id = job.id

        # --- Stage 1: Audio Preparation (Stub) ---
        logger.info("Meeting %s: Audio preparation stage started", meeting_id_str)
        # Touch meeting heartbeat
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting_uuid)
            .values(
                status="preparing",
                stage="audio_processing",
                progress_pct=20.0,
                updated_at=func.now(),
            )
        )
        session.commit()

        # --- Stage 2: Transcription (Stub) ---
        logger.info("Meeting %s: Transcription stage started", meeting_id_str)
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting_uuid)
            .values(
                status="transcribing",
                stage="transcription",
                progress_pct=50.0,
                updated_at=func.now(),
            )
        )
        session.execute(
            update(Job).where(Job.id == job_id).values(stage="transcription", updated_at=func.now())
        )
        session.commit()

        # --- Stage 3: LLM Analysis (Stub) ---
        logger.info("Meeting %s: Analysis stage started", meeting_id_str)
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting_uuid)
            .values(
                status="analyzing",
                stage="summarization",
                progress_pct=80.0,
                updated_at=func.now(),
            )
        )
        session.execute(
            update(Job).where(Job.id == job_id).values(stage="summarization", updated_at=func.now())
        )
        session.commit()

        # --- Stage 4: Finalize & Done ---
        logger.info("Meeting %s: Finalizing pipeline", meeting_id_str)
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting_uuid)
            .values(
                status="done",
                stage=None,
                progress_pct=100.0,
                error_message=None,
                updated_at=func.now(),
            )
        )
        session.execute(
            update(Job)
            .where(Job.id == job_id)
            .values(
                status="done",
                finished_at=datetime.now(timezone.utc),
                updated_at=func.now(),
            )
        )
        session.commit()

        logger.info("Meeting %s processed successfully", meeting_id_str)
        return {"status": "done", "meeting_id": meeting_id_str}

    except Exception as exc:
        session.rollback()
        logger.exception("Error processing meeting %s: %s", meeting_id_str, exc)
        err_msg = str(exc)

        # Mark meeting as failed
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting_uuid)
            .values(
                status="failed",
                error_message=err_msg,
                updated_at=func.now(),
            )
        )

        if job_id:
            session.execute(
                update(Job)
                .where(Job.id == job_id)
                .values(
                    status="failed",
                    error=err_msg,
                    finished_at=datetime.now(timezone.utc),
                    updated_at=func.now(),
                )
            )
        session.commit()

        # Retry transient exceptions if retries remain
        if (
            isinstance(exc, (ConnectionError, TimeoutError, OSError))
            and self.request.retries < self.max_retries
        ):
            raise self.retry(exc=exc)
        raise

    finally:
        session.close()
