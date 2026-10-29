import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Meeting
from app.services.storage import get_storage_service


async def create_user_and_token(client: AsyncClient, email: str) -> str:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_get_audio_url_success(client: AsyncClient, db_session, tmp_path):
    token = await create_user_and_token(client, "audio_url_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    dummy_file = tmp_path / "audio.wav"
    dummy_file.write_bytes(b"RIFF" + b"\x00" * 40)

    audio_key = f"uploads/{user_id}/sample/normalized.wav"
    storage = get_storage_service()
    storage.upload_from(audio_key, dummy_file)

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Playback Meeting",
        status="done",
        audio_key=audio_key,
        normalized_key=audio_key,
    )
    db_session.add(meeting)
    await db_session.commit()

    res = await client.get(f"/api/v1/meetings/{meeting.id}/audio-url", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "url" in data
    assert data["expires_in"] == 900
    assert len(data["url"]) > 10


@pytest.mark.asyncio
async def test_get_audio_url_missing_file_404(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "missing_audio@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Unuploaded Meeting",
        status="pending_upload",
        audio_key=None,
    )
    db_session.add(meeting)
    await db_session.commit()

    res = await client.get(f"/api/v1/meetings/{meeting.id}/audio-url", headers=headers)
    assert res.status_code == 404
