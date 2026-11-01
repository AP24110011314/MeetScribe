import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Meeting
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_folders_crud_and_counts(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "folders_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Folder
    res = await client.post(
        "/api/v1/folders",
        json={"name": "Engineering", "color": "#6366f1"},
        headers=headers,
    )
    assert res.status_code == 201
    f_data = res.json()
    assert f_data["name"] == "Engineering"
    assert f_data["color"] == "#6366f1"
    assert f_data["meeting_count"] == 0
    folder_id = f_data["id"]

    # 2. Add Meeting to Folder
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])
    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        folder_id=uuid.UUID(folder_id),
        title="Sprint Sync",
        status="done",
    )
    db_session.add(meeting)
    await db_session.commit()

    # 3. List Folders (meeting count should be 1)
    res_list = await client.get("/api/v1/folders", headers=headers)
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == folder_id
    assert items[0]["meeting_count"] == 1

    # 4. Patch Folder
    res_patch = await client.patch(
        f"/api/v1/folders/{folder_id}",
        json={"name": "Core Engineering", "color": "#3b82f6"},
        headers=headers,
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["name"] == "Core Engineering"
    assert res_patch.json()["color"] == "#3b82f6"

    # 5. Delete Folder (meeting should become unfiled, not deleted)
    res_del = await client.delete(f"/api/v1/folders/{folder_id}", headers=headers)
    assert res_del.status_code == 204

    # Verify meeting still exists and has folder_id None
    m_check = await db_session.get(Meeting, meeting.id)
    assert m_check is not None
    assert m_check.folder_id is None


@pytest.mark.asyncio
async def test_folders_isolation(client: AsyncClient, db_session):
    token_a = await create_user_and_token(client, "user_a@example.com")
    token_b = await create_user_and_token(client, "user_b@example.com")

    # User A creates folder
    res = await client.post(
        "/api/v1/folders",
        json={"name": "Secret Project", "color": "#ff0000"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res.status_code == 201
    folder_id = res.json()["id"]

    # User B cannot patch or delete User A's folder (404)
    res_patch = await client.patch(
        f"/api/v1/folders/{folder_id}",
        json={"name": "Hacked"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_patch.status_code == 404

    res_del = await client.delete(
        f"/api/v1/folders/{folder_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_del.status_code == 404
