import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.db.models import Meeting
from app.services.storage import get_storage_service
from app.workers.reaper import purge_expired_trash
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_trash_list_restore_and_empty(client: AsyncClient, db_session, tmp_path):
    token = await create_user_and_token(client, "trash_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    storage = get_storage_service()
    audio_key = f"uploads/{user_id}/trash_test/audio.wav"
    dummy_wav = tmp_path / "dummy_trash.wav"
    dummy_wav.write_bytes(b"RIFF trash dummy")
    storage.upload_from(audio_key, dummy_wav)

    # 1. Create active meeting
    m1 = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Meeting To Trash",
        audio_key=audio_key,
        status="done",
    )
    db_session.add(m1)
    await db_session.commit()

    # 2. Soft-delete it
    del_res = await client.delete(f"/api/v1/meetings/{m1.id}", headers=headers)
    assert del_res.status_code == 204

    # 3. List trash
    trash_res = await client.get("/api/v1/trash", headers=headers)
    assert trash_res.status_code == 200
    trash_data = trash_res.json()
    assert trash_data["total"] == 1
    assert trash_data["items"][0]["id"] == str(m1.id)
    assert trash_data["items"][0]["days_until_purge"] == 30

    # 4. Restore meeting
    rest_res = await client.post(f"/api/v1/trash/{m1.id}/restore", headers=headers)
    assert rest_res.status_code == 200
    assert rest_res.json()["status"] == "restored"

    # Verify meeting is back in active list
    list_res = await client.get("/api/v1/meetings", headers=headers)
    assert list_res.status_code == 200
    assert list_res.json()["total"] == 1

    # 5. Trash it again and empty trash
    await client.delete(f"/api/v1/meetings/{m1.id}", headers=headers)
    empty_res = await client.delete("/api/v1/trash/empty/all", headers=headers)
    assert empty_res.status_code == 200
    assert empty_res.json()["deleted_count"] == 1

    # Storage should be wiped
    assert storage.exists(audio_key) is False


def test_trash_beat_auto_purge(sync_db, tmp_path):
    storage = get_storage_service()

    # Create dummy user
    from app.core.security import hash_password
    from app.db.models import User

    user = User(
        id=uuid.uuid4(),
        email="beat_purge_user@example.com",
        password_hash=hash_password("password123"),
    )
    sync_db.add(user)
    sync_db.commit()

    # Expired meeting (deleted 32 days ago)
    old_key = f"uploads/{user.id}/expired/audio.wav"
    dummy_wav = tmp_path / "old.wav"
    dummy_wav.write_bytes(b"old")
    storage.upload_from(old_key, dummy_wav)

    old_meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Old Trashed Meeting",
        audio_key=old_key,
        status="done",
        deleted_at=datetime.now(timezone.utc) - timedelta(days=32),
    )

    # Freshly trashed meeting (deleted 2 days ago)
    fresh_key = f"uploads/{user.id}/fresh/audio.wav"
    dummy_wav2 = tmp_path / "fresh.wav"
    dummy_wav2.write_bytes(b"fresh")
    storage.upload_from(fresh_key, dummy_wav2)

    fresh_meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user.id,
        title="Fresh Trashed Meeting",
        audio_key=fresh_key,
        status="done",
        deleted_at=datetime.now(timezone.utc) - timedelta(days=2),
    )

    sync_db.add_all([old_meeting, fresh_meeting])
    sync_db.commit()

    old_id = old_meeting.id
    fresh_id = fresh_meeting.id

    # Run reaper beat task
    res = purge_expired_trash(retention_days=30)
    assert res["purged"] == 1

    # Expire cached objects in test session
    sync_db.expire_all()

    # Verify old meeting is gone and its storage deleted
    assert sync_db.get(Meeting, old_id) is None
    assert storage.exists(old_key) is False

    # Verify fresh meeting still exists in trash with audio preserved
    assert sync_db.get(Meeting, fresh_id) is not None
    assert storage.exists(fresh_key) is True
