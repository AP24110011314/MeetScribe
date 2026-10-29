import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Meeting
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_rename_meeting_success(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "rename_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Original Title",
        title_edited=False,
        status="done",
    )
    db_session.add(meeting)
    await db_session.commit()

    # Rename
    res = await client.patch(
        f"/api/v1/meetings/{meeting.id}",
        json={"title": "Updated Brand New Title"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Updated Brand New Title"
    assert data["title_edited"] is True

    # Check in DB
    await db_session.refresh(meeting)
    assert meeting.title == "Updated Brand New Title"
    assert meeting.title_edited is True


@pytest.mark.asyncio
async def test_rename_meeting_validation_and_isolation(client: AsyncClient, db_session):
    token_owner = await create_user_and_token(client, "owner_rename@example.com")
    token_other = await create_user_and_token(client, "other_rename@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_owner}"})
    owner_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=owner_id,
        title="Owner Meeting",
        status="done",
    )
    db_session.add(meeting)
    await db_session.commit()

    # Empty title should fail validation (422)
    res_invalid = await client.patch(
        f"/api/v1/meetings/{meeting.id}",
        json={"title": "   "},
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert res_invalid.status_code == 422

    # Other user gets 404
    res_other = await client.patch(
        f"/api/v1/meetings/{meeting.id}",
        json={"title": "Hacked Title"},
        headers={"Authorization": f"Bearer {token_other}"},
    )
    assert res_other.status_code == 404
