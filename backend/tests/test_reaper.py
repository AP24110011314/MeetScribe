import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.db.models import Job, Meeting, User
from app.workers.reaper import reap_stuck_jobs


@pytest.mark.asyncio
async def test_reaper_requeues_stuck_meeting(db_session):
    # Create test user
    user = User(
        id=uuid.uuid4(),
        email="reaper_user@example.com",
        password_hash="argon2id$hashed",
    )
    db_session.add(user)
    await db_session.commit()

    # Create meeting stuck in 'preparing' with updated_at in the past
    stuck_time = datetime.now(timezone.utc) - timedelta(minutes=20)
    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Stuck Meeting",
        status="preparing",
        stage="audio_processing",
        progress_pct=15.0,
        process_attempts=1,
    )
    db_session.add(meeting)
    await db_session.commit()

    # Explicitly set updated_at in the past
    await db_session.execute(
        update(Meeting).where(Meeting.id == meeting.id).values(updated_at=stuck_time)
    )
    await db_session.commit()

    with patch("app.workers.reaper.process_meeting.delay") as mock_delay:
        result = reap_stuck_jobs(stale_minutes=15)
        assert result["requeued"] == 1
        assert result["failed"] == 0
        mock_delay.assert_called_once_with(str(meeting.id))

    # Refresh meeting from DB and verify status updated
    await db_session.refresh(meeting)
    assert meeting.status == "queued"
    assert meeting.stage is None


@pytest.mark.asyncio
async def test_reaper_fails_meeting_exceeding_max_attempts(db_session):
    user = User(
        id=uuid.uuid4(),
        email="reaper_fail@example.com",
        password_hash="argon2id$hashed",
    )
    db_session.add(user)
    await db_session.commit()

    stuck_time = datetime.now(timezone.utc) - timedelta(minutes=30)
    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Exhausted Meeting",
        status="transcribing",
        stage="transcription",
        progress_pct=50.0,
        process_attempts=settings.MAX_PROCESS_ATTEMPTS,
    )
    db_session.add(meeting)
    await db_session.commit()

    # Add open job
    job = Job(
        id=uuid.uuid4(),
        meeting_id=meeting.id,
        stage="transcription",
        status="processing",
        attempts=settings.MAX_PROCESS_ATTEMPTS,
    )
    db_session.add(job)
    await db_session.commit()

    await db_session.execute(
        update(Meeting).where(Meeting.id == meeting.id).values(updated_at=stuck_time)
    )
    await db_session.commit()

    with patch("app.workers.reaper.process_meeting.delay") as mock_delay:
        result = reap_stuck_jobs(stale_minutes=15)
        assert result["requeued"] == 0
        assert result["failed"] == 1
        mock_delay.assert_not_called()

    # Refresh meeting and job from DB
    await db_session.refresh(meeting)
    await db_session.refresh(job)
    assert meeting.status == "failed"
    assert "exceeded maximum retry attempts" in meeting.error_message
    assert job.status == "failed"
    assert "reaped" in job.error


@pytest.mark.asyncio
async def test_reaper_ignores_recent_or_finished_meetings(db_session):
    user = User(
        id=uuid.uuid4(),
        email="reaper_ignore@example.com",
        password_hash="argon2id$hashed",
    )
    db_session.add(user)
    await db_session.commit()

    # 1. Active but recent meeting (updated 2 minutes ago)
    recent_time = datetime.now(timezone.utc) - timedelta(minutes=2)
    m_active = Meeting(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Recent Active",
        status="analyzing",
        stage="summarization",
        progress_pct=80.0,
        process_attempts=1,
    )
    # 2. Done meeting from long ago
    old_time = datetime.now(timezone.utc) - timedelta(hours=2)
    m_done = Meeting(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Old Done",
        status="done",
        progress_pct=100.0,
        process_attempts=1,
    )
    db_session.add_all([m_active, m_done])
    await db_session.commit()

    await db_session.execute(
        update(Meeting).where(Meeting.id == m_active.id).values(updated_at=recent_time)
    )
    await db_session.execute(
        update(Meeting).where(Meeting.id == m_done.id).values(updated_at=old_time)
    )
    await db_session.commit()

    with patch("app.workers.reaper.process_meeting.delay") as mock_delay:
        result = reap_stuck_jobs(stale_minutes=15)
        assert result["requeued"] == 0
        assert result["failed"] == 0
        mock_delay.assert_not_called()

    # Verify statuses unchanged
    res_active = await db_session.execute(select(Meeting).where(Meeting.id == m_active.id))
    assert res_active.scalar_one().status == "analyzing"

    res_done = await db_session.execute(select(Meeting).where(Meeting.id == m_done.id))
    assert res_done.scalar_one().status == "done"
