import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, update

from app.core.config import settings
from app.db.models import Job, Meeting
from app.db.session import get_sync_db
from app.workers.celery_app import celery_app
from app.workers.tasks import process_meeting

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.reaper.reap_stuck_jobs")  # type: ignore[untyped-decorator]
def reap_stuck_jobs(stale_minutes: Optional[int] = None) -> dict[str, int]:
    """
    Reaper beat task:
    Finds meetings stuck in active processing stages (queued, preparing, transcribing, analyzing)
    where updated_at is older than REAPER_STALE_MINUTES.

    If process_attempts < MAX_PROCESS_ATTEMPTS:
        Re-queues the meeting by resetting status to 'queued' and calling process_meeting.delay().
    Else:
        Marks the meeting as 'failed' with a descriptive error message.
    """
    mins = stale_minutes if stale_minutes is not None else settings.REAPER_STALE_MINUTES
    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=mins)

    requeued_count = 0
    failed_count = 0

    session = get_sync_db()
    try:
        stmt = select(Meeting).where(
            Meeting.status.in_(["queued", "preparing", "transcribing", "analyzing"]),
            Meeting.updated_at <= stale_cutoff,
        )
        stuck_meetings = session.execute(stmt).scalars().all()

        for meeting in stuck_meetings:
            if meeting.process_attempts < settings.MAX_PROCESS_ATTEMPTS:
                logger.warning(
                    "Reaping stuck meeting %s: re-enqueuing (attempt %d/%d)",
                    meeting.id,
                    meeting.process_attempts,
                    settings.MAX_PROCESS_ATTEMPTS,
                )
                session.execute(
                    update(Meeting)
                    .where(Meeting.id == meeting.id)
                    .values(
                        status="queued",
                        stage=None,
                        updated_at=datetime.now(timezone.utc),
                    )
                )
                session.commit()
                process_meeting.delay(str(meeting.id))
                requeued_count += 1
            else:
                logger.error(
                    "Reaping stuck meeting %s: marking failed (reached max attempts %d)",
                    meeting.id,
                    meeting.process_attempts,
                )
                session.execute(
                    update(Meeting)
                    .where(Meeting.id == meeting.id)
                    .values(
                        status="failed",
                        error_message=(
                            f"Job stuck and exceeded maximum retry attempts ({settings.MAX_PROCESS_ATTEMPTS})"
                        ),
                        updated_at=datetime.now(timezone.utc),
                    )
                )
                session.execute(
                    update(Job)
                    .where(
                        Job.meeting_id == meeting.id,
                        Job.status == "processing",
                    )
                    .values(
                        status="failed",
                        error="Stuck job reaped by beat task",
                        finished_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc),
                    )
                )
                session.commit()
                failed_count += 1

        return {"requeued": requeued_count, "failed": failed_count}

    except Exception:
        session.rollback()
        logger.exception("Error running reaper task")
        raise
    finally:
        session.close()
