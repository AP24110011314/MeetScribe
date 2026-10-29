from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.models import Job, Meeting
from app.workers.tasks import process_meeting


async def register_and_login(client: AsyncClient, email: str = "pipeline_test@example.com") -> str:
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    res = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_process_meeting_success_lifecycle(client: AsyncClient, db_session):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create meeting
    res = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={"filename": "standup.mp3", "content_type": "audio/mpeg", "size_bytes": 1024},
    )
    meeting_id = res.json()["meeting_id"]

    # 2. Complete upload
    with (
        patch("app.services.storage.S3StorageService.exists", return_value=True),
        patch("app.services.storage.LocalStorageService.exists", return_value=True),
    ):
        complete_res = await client.post(
            f"/api/v1/meetings/{meeting_id}/complete",
            headers=headers,
        )
        assert complete_res.status_code == 200
        assert complete_res.json()["status"] == "queued"

    # 3. Check status endpoint before worker processing
    status_res = await client.get(
        f"/api/v1/meetings/{meeting_id}/status",
        headers=headers,
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "queued"
    assert status_res.json()["progress_pct"] == 5.0

    # 4. Run worker task directly
    result = process_meeting(meeting_id)
    assert result["status"] == "done"
    assert result["meeting_id"] == meeting_id

    # 5. Check status endpoint after processing
    status_after = await client.get(
        f"/api/v1/meetings/{meeting_id}/status",
        headers=headers,
    )
    assert status_after.status_code == 200
    data = status_after.json()
    assert data["status"] == "done"
    assert data["stage"] is None
    assert data["progress_pct"] == 100.0
    assert data["error_message"] is None
    assert data["process_attempts"] == 1

    # 6. Verify Job record in db
    result_jobs = await db_session.execute(select(Job).where(Job.meeting_id == meeting_id))
    jobs = result_jobs.scalars().all()
    assert len(jobs) == 1
    assert jobs[0].status == "done"
    assert jobs[0].finished_at is not None


@pytest.mark.asyncio
async def test_process_meeting_idempotency_skip(client: AsyncClient, db_session):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={"filename": "standup.mp3", "content_type": "audio/mpeg", "size_bytes": 1024},
    )
    meeting_id = res.json()["meeting_id"]

    with (
        patch("app.services.storage.S3StorageService.exists", return_value=True),
        patch("app.services.storage.LocalStorageService.exists", return_value=True),
    ):
        await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=headers)

    # First run succeeds
    run1 = process_meeting(meeting_id)
    assert run1["status"] == "done"

    # Second run should skip cleanly (0 rows updated in claim)
    run2 = process_meeting(meeting_id)
    assert run2["status"] == "skipped"

    # Ensure attempts remain 1
    result = await db_session.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one()
    assert meeting.process_attempts == 1
    assert meeting.status == "done"


@pytest.mark.asyncio
async def test_process_meeting_failure_handling(client: AsyncClient, db_session):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={"filename": "corrupt.mp3", "content_type": "audio/mpeg", "size_bytes": 1024},
    )
    meeting_id = res.json()["meeting_id"]

    with (
        patch("app.services.storage.S3StorageService.exists", return_value=True),
        patch("app.services.storage.LocalStorageService.exists", return_value=True),
    ):
        await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=headers)

    # Simulate an unrecoverable failure during a processing stage
    with patch(
        "app.workers.tasks.update",
        side_effect=[
            # First call to claim succeeds (handled normally by database, so we mock logger or something later)
            # Let's mock datetime or let stage 2 raise ValueError
        ],
    ):
        pass

    with patch("app.workers.tasks.Job", side_effect=ValueError("Corrupted audio data stream")):
        with pytest.raises(ValueError, match="Corrupted audio data stream"):
            process_meeting(meeting_id)

    # Check meeting marked failed in database
    result = await db_session.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one()
    assert meeting.status == "failed"
    assert "Corrupted audio data stream" in meeting.error_message


@pytest.mark.asyncio
async def test_get_meeting_status_isolation(client: AsyncClient):
    # User 1 creates meeting
    token1 = await register_and_login(client, email="user_one@example.com")
    res1 = await client.post(
        "/api/v1/meetings",
        headers={"Authorization": f"Bearer {token1}"},
        json={"filename": "user1.mp3", "content_type": "audio/mpeg", "size_bytes": 1024},
    )
    meeting_id = res1.json()["meeting_id"]

    # User 2 tries to get status of User 1's meeting
    token2 = await register_and_login(client, email="user_two@example.com")
    res2 = await client.get(
        f"/api/v1/meetings/{meeting_id}/status",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res2.status_code == 404
