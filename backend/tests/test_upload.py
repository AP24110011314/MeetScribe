from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.db.models import Meeting


async def register_and_login(client: AsyncClient, email: str = "test@example.com") -> str:
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
async def test_create_meeting_unauthenticated(client: AsyncClient):
    response = await client.post(
        "/api/v1/meetings",
        json={"filename": "test.mp3", "content_type": "audio/mpeg", "size_bytes": 1024},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_meeting_success(client: AsyncClient, db_session):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={
            "filename": "team_standup.mp3",
            "content_type": "audio/mpeg",
            "size_bytes": 5 * 1024 * 1024,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "meeting_id" in data
    assert "upload_url" in data
    assert data["upload_method"] == "PUT"
    assert data["upload_headers"]["Content-Type"] == "audio/mpeg"
    assert data["expires_in"] == 900
    assert data["storage_backend"] in ("s3", "local")

    # Verify meeting in database
    result = await db_session.execute(select(Meeting).where(Meeting.id == data["meeting_id"]))
    meeting = result.scalar_one_or_none()
    assert meeting is not None
    assert meeting.title == "team_standup"
    assert meeting.original_filename == "team_standup.mp3"
    assert meeting.status == "pending_upload"
    assert meeting.progress_pct == 0.0
    assert meeting.audio_key == f"uploads/{meeting.user_id}/{meeting.id}/original.mp3"


@pytest.mark.asyncio
async def test_create_meeting_unsupported_format(client: AsyncClient):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={
            "filename": "document.pdf",
            "content_type": "application/pdf",
            "size_bytes": 1024,
        },
    )
    assert response.status_code == 422
    assert "Unsupported file type" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_meeting_size_too_large(client: AsyncClient):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    large_size = (settings.MAX_UPLOAD_MB + 1) * 1024 * 1024
    response = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={
            "filename": "huge.wav",
            "content_type": "audio/wav",
            "size_bytes": large_size,
        },
    )
    assert response.status_code == 422
    assert "File size must be between" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_meeting_size_zero_or_negative(client: AsyncClient):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={
            "filename": "empty.mp3",
            "content_type": "audio/mpeg",
            "size_bytes": 0,
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_complete_meeting_upload_file_missing(client: AsyncClient):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Create meeting
    res = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={
            "filename": "meeting.mp3",
            "content_type": "audio/mpeg",
            "size_bytes": 1024,
        },
    )
    meeting_id = res.json()["meeting_id"]

    # Storage service exists() will return False by default since nothing uploaded
    with (
        patch("app.services.storage.S3StorageService.exists", return_value=False),
        patch("app.services.storage.LocalStorageService.exists", return_value=False),
    ):
        complete_res = await client.post(
            f"/api/v1/meetings/{meeting_id}/complete",
            headers=headers,
        )
        assert complete_res.status_code == 400
        assert "not found in storage" in complete_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_complete_meeting_upload_success(client: AsyncClient, db_session):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={
            "filename": "planning.m4a",
            "content_type": "audio/m4a",
            "size_bytes": 2048,
        },
    )
    meeting_id = res.json()["meeting_id"]

    # Mock storage.exists to return True
    with (
        patch("app.services.storage.S3StorageService.exists", return_value=True),
        patch("app.services.storage.LocalStorageService.exists", return_value=True),
    ):
        complete_res = await client.post(
            f"/api/v1/meetings/{meeting_id}/complete",
            headers=headers,
        )
        assert complete_res.status_code == 200
        status_data = complete_res.json()
        assert status_data["meeting_id"] == meeting_id
        assert status_data["status"] == "queued"
        assert status_data["progress_pct"] == 5.0

    # Verify meeting in db
    result = await db_session.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one()
    assert meeting.status == "queued"
    assert meeting.progress_pct == 5.0


@pytest.mark.asyncio
async def test_complete_meeting_already_queued_conflict(client: AsyncClient):
    token = await register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/v1/meetings",
        headers=headers,
        json={
            "filename": "sync.mp3",
            "content_type": "audio/mpeg",
            "size_bytes": 1024,
        },
    )
    meeting_id = res.json()["meeting_id"]

    with (
        patch("app.services.storage.S3StorageService.exists", return_value=True),
        patch("app.services.storage.LocalStorageService.exists", return_value=True),
    ):
        res1 = await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=headers)
        assert res1.status_code == 200

        # Attempt to complete again
        res2 = await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=headers)
        assert res2.status_code == 409
        assert "already in status" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_complete_meeting_isolation_other_user(client: AsyncClient):
    # User 1 creates meeting
    token1 = await register_and_login(client, email="user1@example.com")
    headers1 = {"Authorization": f"Bearer {token1}"}

    res = await client.post(
        "/api/v1/meetings",
        headers=headers1,
        json={
            "filename": "user1_secret.mp3",
            "content_type": "audio/mpeg",
            "size_bytes": 1024,
        },
    )
    meeting_id = res.json()["meeting_id"]

    # User 2 tries to complete User 1's meeting
    token2 = await register_and_login(client, email="user2@example.com")
    headers2 = {"Authorization": f"Bearer {token2}"}

    with (
        patch("app.services.storage.S3StorageService.exists", return_value=True),
        patch("app.services.storage.LocalStorageService.exists", return_value=True),
    ):
        complete_res = await client.post(
            f"/api/v1/meetings/{meeting_id}/complete",
            headers=headers2,
        )
        # Enforcing user ownership: 404 for other users
        assert complete_res.status_code == 404
