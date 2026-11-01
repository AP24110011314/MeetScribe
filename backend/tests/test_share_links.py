import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Meeting, Summary, Transcript
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_share_link_lifecycle_unprotected(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "share_user1@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Public All-Hands",
        status="done",
        duration_sec=1800.0,
    )
    db_session.add(meeting)
    await db_session.flush()

    summary = Summary(
        meeting_id=meeting.id,
        summary="Company quarterly all-hands overview.",
        key_points=["Revenue up 20%", "Launched v2"],
        decisions=["Keep hiring remote"],
        llm_model="fake",
    )
    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Welcome everyone to our all-hands.",
        segments=[
            {"id": 0, "start": 0.0, "end": 3.0, "text": "Welcome everyone to our all-hands."}
        ],
        model="fake",
    )
    db_session.add_all([summary, transcript])
    await db_session.commit()

    # 1. Create share link
    create_res = await client.post(
        f"/api/v1/meetings/{meeting.id}/share",
        json={"expires_in_days": None, "hide_transcript": False},
        headers=headers,
    )
    assert create_res.status_code == 201
    data = create_res.json()
    assert data["token"] is not None
    assert data["share_url"] == f"/share/{data['token']}"
    assert data["has_password"] is False
    assert data["view_count"] == 0
    share_token = data["token"]
    link_id = data["id"]

    # 2. Public view (unauthenticated, no Authorization header)
    public_res = await client.get(f"/api/v1/share/{share_token}")
    assert public_res.status_code == 200
    pub_data = public_res.json()
    assert pub_data["title"] == "Public All-Hands"
    assert pub_data["summary"]["summary"] == "Company quarterly all-hands overview."
    assert pub_data["transcript"]["full_text"] == "Welcome everyone to our all-hands."
    assert pub_data["hide_transcript"] is False

    # 3. List share links
    list_res = await client.get(f"/api/v1/meetings/{meeting.id}/share", headers=headers)
    assert list_res.status_code == 200
    links = list_res.json()
    assert len(links) == 1
    assert links[0]["view_count"] == 1  # Incremented after public view

    # 4. Revoke share link
    revoke_res = await client.delete(
        f"/api/v1/meetings/{meeting.id}/share/{link_id}", headers=headers
    )
    assert revoke_res.status_code == 204

    # 5. Public view after revoke -> 404
    public_res_after = await client.get(f"/api/v1/share/{share_token}")
    assert public_res_after.status_code == 404


@pytest.mark.asyncio
async def test_share_link_password_protection_and_hide_transcript(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "share_pwd_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Confidential Strategy",
        status="done",
        duration_sec=900.0,
    )
    db_session.add(meeting)
    await db_session.flush()

    summary = Summary(
        meeting_id=meeting.id,
        summary="Confidential M&A discussion.",
        key_points=["Target acquisition"],
        decisions=["Proceed with DD"],
        llm_model="fake",
    )
    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Super confidential text.",
        segments=[{"id": 0, "start": 0.0, "end": 2.0, "text": "Super confidential text."}],
        model="fake",
    )
    db_session.add_all([summary, transcript])
    await db_session.commit()

    # Create password-protected share link with hidden transcript
    create_res = await client.post(
        f"/api/v1/meetings/{meeting.id}/share",
        json={"password": "supersecretpassword", "hide_transcript": True},
        headers=headers,
    )
    assert create_res.status_code == 201
    data = create_res.json()
    share_token = data["token"]
    assert data["has_password"] is True
    assert data["hide_transcript"] is True

    # 1. Unauthenticated GET without unlocking -> 401 with requires_password
    pub_res = await client.get(f"/api/v1/share/{share_token}")
    assert pub_res.status_code == 401
    detail = pub_res.json()["detail"]
    assert detail["requires_password"] is True
    assert detail["title"] == "Confidential Strategy"

    # 2. Unlock with wrong password -> 401
    unlock_err = await client.post(
        f"/api/v1/share/{share_token}/unlock",
        json={"password": "wrongpassword"},
    )
    assert unlock_err.status_code == 401
    assert "Incorrect password" in unlock_err.json()["detail"]

    # 3. Unlock with correct password -> 200, transcript is hidden
    unlock_ok = await client.post(
        f"/api/v1/share/{share_token}/unlock",
        json={"password": "supersecretpassword"},
    )
    assert unlock_ok.status_code == 200
    res_data = unlock_ok.json()
    assert res_data["title"] == "Confidential Strategy"
    assert res_data["summary"]["summary"] == "Confidential M&A discussion."
    assert res_data["transcript"] is None
    assert res_data["hide_transcript"] is True


@pytest.mark.asyncio
async def test_share_link_ownership_and_expiration(client: AsyncClient, db_session):
    owner_token = await create_user_and_token(client, "owner_share@example.com")
    other_token = await create_user_and_token(client, "other_share@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {owner_token}"})
    owner_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=owner_id,
        title="Owner Meeting",
        status="done",
    )
    db_session.add(meeting)
    await db_session.commit()

    # Other user cannot create share link -> 404
    err_res = await client.post(
        f"/api/v1/meetings/{meeting.id}/share",
        json={},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert err_res.status_code == 404

    # Other user cannot list share links -> 404
    err_list = await client.get(
        f"/api/v1/meetings/{meeting.id}/share",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert err_list.status_code == 404
