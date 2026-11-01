import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Folder, Meeting, Tag
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_bulk_operations(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "bulk_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # Create 3 meetings
    m1 = Meeting(id=uuid.uuid4(), user_id=user_id, title="M1", status="done")
    m2 = Meeting(id=uuid.uuid4(), user_id=user_id, title="M2", status="done")
    m3 = Meeting(id=uuid.uuid4(), user_id=user_id, title="M3", status="done")
    db_session.add_all([m1, m2, m3])
    await db_session.commit()

    meeting_ids = [str(m1.id), str(m2.id), str(m3.id)]

    # 1. Bulk Star
    res_star = await client.post(
        "/api/v1/meetings/bulk",
        json={"meeting_ids": meeting_ids, "action": "star"},
        headers=headers,
    )
    assert res_star.status_code == 200
    assert res_star.json()["affected_count"] == 3

    m1_check = await db_session.get(Meeting, m1.id)
    assert m1_check.is_starred is True

    # 2. Bulk Pin
    res_pin = await client.post(
        "/api/v1/meetings/bulk",
        json={"meeting_ids": [meeting_ids[0]], "action": "pin"},
        headers=headers,
    )
    assert res_pin.status_code == 200
    m1_refreshed = await db_session.get(Meeting, m1.id)
    assert m1_refreshed.is_pinned is True

    # 3. Bulk Move to Folder
    folder = Folder(id=uuid.uuid4(), user_id=user_id, name="Project X")
    db_session.add(folder)
    await db_session.commit()

    res_move = await client.post(
        "/api/v1/meetings/bulk",
        json={"meeting_ids": meeting_ids, "action": "move", "folder_id": str(folder.id)},
        headers=headers,
    )
    assert res_move.status_code == 200
    m2_check = await db_session.get(Meeting, m2.id)
    assert m2_check.folder_id == folder.id

    # 4. Bulk Tag
    tag = Tag(id=uuid.uuid4(), user_id=user_id, name="BulkTag")
    db_session.add(tag)
    await db_session.commit()

    res_tag = await client.post(
        "/api/v1/meetings/bulk",
        json={"meeting_ids": meeting_ids, "action": "tag", "tag_ids": [str(tag.id)]},
        headers=headers,
    )
    assert res_tag.status_code == 200

    # 5. Bulk Trash
    res_trash = await client.post(
        "/api/v1/meetings/bulk",
        json={"meeting_ids": meeting_ids, "action": "trash"},
        headers=headers,
    )
    assert res_trash.status_code == 200
    m3_check = await db_session.get(Meeting, m3.id)
    assert m3_check.deleted_at is not None
