import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.models import ActionItem, Meeting, Summary, Transcript
from app.services.storage import get_storage_service
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_delete_meeting_success(client: AsyncClient, db_session, tmp_path):
    token = await create_user_and_token(client, "delete_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # Put a dummy file in storage
    storage = get_storage_service()
    audio_key = f"uploads/{user_id}/test_delete/audio.wav"
    dummy_wav = tmp_path / "dummy.wav"
    dummy_wav.write_bytes(b"RIFF dummy audio data")
    storage.upload_from(audio_key, dummy_wav)
    assert storage.exists(audio_key) is True

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="To Be Deleted",
        audio_key=audio_key,
        status="done",
    )
    db_session.add(meeting)
    await db_session.flush()

    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Some text",
        segments=[],
        model="fake",
    )
    summary = Summary(
        meeting_id=meeting.id,
        summary="Summary",
        key_points=[],
        decisions=[],
        llm_model="fake",
    )
    action_item = ActionItem(
        meeting_id=meeting.id,
        description="Action",
    )
    db_session.add_all([transcript, summary, action_item])
    await db_session.commit()

    # Delete meeting
    res = await client.delete(f"/api/v1/meetings/{meeting.id}", headers=headers)
    assert res.status_code == 204

    # Check database records are gone
    m_check = await db_session.get(Meeting, meeting.id)
    assert m_check is None

    t_check = await db_session.execute(
        select(Transcript).where(Transcript.meeting_id == meeting.id)
    )
    assert t_check.scalar_one_or_none() is None

    # Check audio file was deleted from storage
    assert storage.exists(audio_key) is False

    # Second delete returns 404
    res2 = await client.delete(f"/api/v1/meetings/{meeting.id}", headers=headers)
    assert res2.status_code == 404


@pytest.mark.asyncio
async def test_delete_meeting_isolation(client: AsyncClient, db_session):
    token_owner = await create_user_and_token(client, "del_owner@example.com")
    token_other = await create_user_and_token(client, "del_other@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_owner}"})
    owner_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=owner_id,
        title="Owner's Private Meeting",
        status="done",
    )
    db_session.add(meeting)
    await db_session.commit()

    # Other user tries to delete
    res = await client.delete(
        f"/api/v1/meetings/{meeting.id}",
        headers={"Authorization": f"Bearer {token_other}"},
    )
    assert res.status_code == 404

    # Ensure meeting still exists
    m_check = await db_session.get(Meeting, meeting.id)
    assert m_check is not None
