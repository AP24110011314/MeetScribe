import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Meeting
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_tags_crud_and_assignment(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "tags_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Tag
    res = await client.post(
        "/api/v1/tags",
        json={"name": "Q4-Planning", "color": "#10b981"},
        headers=headers,
    )
    assert res.status_code == 201
    tag1_id = res.json()["id"]

    # 2. Duplicate Tag returns 409
    res_dup = await client.post(
        "/api/v1/tags",
        json={"name": "Q4-Planning", "color": "#10b981"},
        headers=headers,
    )
    assert res_dup.status_code == 409

    # 3. Create second tag
    res2 = await client.post(
        "/api/v1/tags",
        json={"name": "Important", "color": "#ef4444"},
        headers=headers,
    )
    assert res2.status_code == 201
    tag2_id = res2.json()["id"]

    # 4. List Tags
    res_list = await client.get("/api/v1/tags", headers=headers)
    assert res_list.status_code == 200
    assert len(res_list.json()) == 2

    # 5. Create Meeting and Assign Tags
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])
    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Strategy Review",
        status="done",
    )
    db_session.add(meeting)
    await db_session.commit()

    res_assign = await client.put(
        f"/api/v1/meetings/{meeting.id}/tags",
        json={"tag_ids": [tag1_id, tag2_id]},
        headers=headers,
    )
    assert res_assign.status_code == 200
    assigned = res_assign.json()
    assert len(assigned) == 2

    # 6. Check Meeting Detail has tags
    res_detail = await client.get(f"/api/v1/meetings/{meeting.id}", headers=headers)
    assert res_detail.status_code == 200
    assert len(res_detail.json()["tags"]) == 2

    # 7. Filter Meetings by Tag
    res_filter = await client.get(f"/api/v1/meetings?tag_id={tag1_id}", headers=headers)
    assert res_filter.status_code == 200
    assert res_filter.json()["total"] == 1

    # 8. Delete Tag
    res_del = await client.delete(f"/api/v1/tags/{tag1_id}", headers=headers)
    assert res_del.status_code == 204
