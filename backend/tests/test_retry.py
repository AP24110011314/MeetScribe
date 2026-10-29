import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.db.models import Meeting
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_retry_failed_meeting(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "retry_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Failed Meeting",
        status="failed",
        stage="transcribe",
        error_message="Something exploded",
        progress_pct=25.0,
        process_attempts=3,
    )
    db_session.add(meeting)
    await db_session.commit()

    with patch("app.workers.tasks.process_meeting.delay") as mock_delay:
        res = await client.post(f"/api/v1/meetings/{meeting.id}/retry", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "queued"
        assert data["stage"] is None
        assert data["progress_pct"] == 5.0
        assert data["error_message"] is None
        assert data["process_attempts"] == 0

        mock_delay.assert_called_once_with(str(meeting.id))

    # Verify in DB
    await db_session.refresh(meeting)
    assert meeting.status == "queued"
    assert meeting.stage is None
    assert meeting.error_message is None
    assert meeting.process_attempts == 0


@pytest.mark.asyncio
async def test_retry_non_failed_conflict(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "retry_conflict@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # Done meeting cannot be retried
    m_done = Meeting(id=uuid.uuid4(), user_id=user_id, title="Done Meeting", status="done")
    db_session.add(m_done)
    await db_session.commit()

    res = await client.post(f"/api/v1/meetings/{m_done.id}/retry", headers=headers)
    assert res.status_code == 409
    assert "Only failed meetings can be retried" in res.json()["detail"]


@pytest.mark.asyncio
async def test_retry_isolation(client: AsyncClient, db_session):
    token_owner = await create_user_and_token(client, "retry_owner@example.com")
    token_other = await create_user_and_token(client, "retry_other@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_owner}"})
    owner_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(id=uuid.uuid4(), user_id=owner_id, title="Owner Failed", status="failed")
    db_session.add(meeting)
    await db_session.commit()

    # Other user gets 404
    res = await client.post(
        f"/api/v1/meetings/{meeting.id}/retry",
        headers={"Authorization": f"Bearer {token_other}"},
    )
    assert res.status_code == 404
