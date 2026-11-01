import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Meeting
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_bookmarks_crud(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "bm_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(id=uuid.uuid4(), user_id=user_id, title="Demo Meeting", status="done")
    db_session.add(meeting)
    await db_session.commit()

    # 1. Create Bookmark
    res = await client.post(
        f"/api/v1/meetings/{meeting.id}/bookmarks",
        json={"timestamp_sec": 42.5, "note": "Great architecture suggestion"},
        headers=headers,
    )
    assert res.status_code == 201
    bm_data = res.json()
    assert bm_data["timestamp_sec"] == 42.5
    assert bm_data["note"] == "Great architecture suggestion"
    bm_id = bm_data["id"]

    # 2. List Bookmarks
    res_list = await client.get(f"/api/v1/meetings/{meeting.id}/bookmarks", headers=headers)
    assert res_list.status_code == 200
    bms = res_list.json()
    assert len(bms) == 1
    assert bms[0]["id"] == bm_id

    # 3. Delete Bookmark
    res_del = await client.delete(
        f"/api/v1/meetings/{meeting.id}/bookmarks/{bm_id}", headers=headers
    )
    assert res_del.status_code == 204

    # 4. List again is empty
    res_list2 = await client.get(f"/api/v1/meetings/{meeting.id}/bookmarks", headers=headers)
    assert res_list2.status_code == 200
    assert len(res_list2.json()) == 0
