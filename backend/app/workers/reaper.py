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


@celery_app.task(name="app.workers.reaper.purge_expired_trash")  # type: ignore[untyped-decorator]
def purge_expired_trash(retention_days: int = 30) -> dict[str, int]:
    """
    Purges meetings soft-deleted more than retention_days ago.
    Wipes their audio keys from storage and cascades deletion in the database.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    purged_count = 0

    from app.services.storage import get_storage_service

    storage = get_storage_service()
    session = get_sync_db()
    try:
        stmt = select(Meeting).where(
            Meeting.deleted_at.isnot(None),
            Meeting.deleted_at <= cutoff,
        )
        expired_meetings = session.execute(stmt).scalars().all()

        for meeting in expired_meetings:
            prefix = f"uploads/{meeting.user_id}/{meeting.id}/"
            try:
                storage.delete(prefix)
            except Exception:
                pass
            if meeting.audio_key:
                try:
                    storage.delete(meeting.audio_key)
                except Exception:
                    pass
            if meeting.normalized_key:
                try:
                    storage.delete(meeting.normalized_key)
                except Exception:
                    pass

            session.delete(meeting)
            purged_count += 1

        session.commit()
        logger.info("Purged %d expired meetings from trash", purged_count)
        return {"purged": purged_count}

    except Exception:
        session.rollback()
        logger.exception("Error purging expired trash")
        raise
    finally:
        session.close()


@celery_app.task(name="app.workers.reaper.check_action_item_due_dates")  # type: ignore[untyped-decorator]
def check_action_item_due_dates() -> dict[str, int]:
    """
    Checks action items due within 24 hours or overdue, generating Notification rows.
    """
    import uuid
    from datetime import date

    from app.db.models import ActionItem, Notification

    today = date.today()
    due_cutoff = today + timedelta(days=1)
    notified_count = 0

    session = get_sync_db()
    try:
        stmt = select(ActionItem).where(
            ActionItem.status.in_(["todo", "in_progress", "open"]),
            ActionItem.due_date.isnot(None),
            ActionItem.due_date <= due_cutoff,
        )
        items = session.execute(stmt).scalars().all()

        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        for item in items:
            existing_stmt = select(Notification).where(
                Notification.user_id == item.user_id,
                Notification.type == "action_item_due",
                Notification.link_url == f"/meetings/{item.meeting_id}",
                Notification.created_at >= today_start,
            )
            exists = session.execute(existing_stmt).first()
            if not exists and item.due_date is not None:
                is_overdue = item.due_date < today
                title = f"{'Overdue' if is_overdue else 'Upcoming'} Action Item: {item.description[:40]}"
                msg = (
                    f"Action item '{item.description}' was due on {item.due_date}."
                    if is_overdue
                    else f"Action item '{item.description}' is due tomorrow ({item.due_date})."
                )
                notif = Notification(
                    id=uuid.uuid4(),
                    user_id=item.user_id,
                    type="action_item_due",
                    title=title,
                    message=msg,
                    link_url=f"/meetings/{item.meeting_id}",
                    is_read=False,
                )
                session.add(notif)
                notified_count += 1

        session.commit()
        logger.info("Sent %d action item due date notifications", notified_count)
        return {"notified": notified_count}
    except Exception:
        session.rollback()
        logger.exception("Error checking action item due dates")
        raise
    finally:
        session.close()
