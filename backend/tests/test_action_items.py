import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from app.db.models import ActionItem, Meeting


async def create_user_and_token(client: AsyncClient, email: str) -> str:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_action_items_crud_and_filters(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "actions_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # 1. Create meeting
    meeting = Meeting(id=uuid.uuid4(), user_id=user_id, title="Sprint Planning", status="done")
    db_session.add(meeting)
    await db_session.commit()

    # 2. POST /meetings/{id}/action-items (Create manual item)
    create_payload = {
        "description": "Write integration test specs",
        "owner": "Priya",
        "due_date": "2026-11-15",
        "priority": "high",
        "status": "open",
    }
    post_res = await client.post(
        f"/api/v1/meetings/{meeting.id}/action-items",
        headers=headers,
        json=create_payload,
    )
    assert post_res.status_code == 201
    item1 = post_res.json()
    assert item1["description"] == "Write integration test specs"
    assert item1["owner"] == "Priya"
    assert item1["created_by_ai"] is False
    assert item1["meeting_title"] == "Sprint Planning"
    item1_id = item1["id"]

    # 3. Add a second item directly for filtering tests
    item2 = ActionItem(
        id=uuid.uuid4(),
        meeting_id=meeting.id,
        user_id=user_id,
        description="Fix CSS responsive layout",
        owner="Ravi",
        due_date=date(2026, 12, 1),
        priority="low",
        status="in_progress",
        created_by_ai=True,
    )
    db_session.add(item2)
    await db_session.commit()

    # 4. GET /action-items (Cross-meeting list with filters)
    # Filter by owner: Priya
    res_priya = await client.get("/api/v1/action-items?owner=Priya", headers=headers)
    assert res_priya.status_code == 200
    assert res_priya.json()["total"] == 1
    assert res_priya.json()["items"][0]["owner"] == "Priya"

    # Filter by priority: low
    res_low = await client.get("/api/v1/action-items?priority=low", headers=headers)
    assert res_low.json()["total"] == 1
    assert res_low.json()["items"][0]["description"] == "Fix CSS responsive layout"

    # Filter by due_before: 2026-11-20
    res_due = await client.get("/api/v1/action-items?due_before=2026-11-20", headers=headers)
    assert res_due.json()["total"] == 1
    assert res_due.json()["items"][0]["id"] == item1_id

    # 5. PATCH /action-items/{id}
    patch_res = await client.patch(
        f"/api/v1/action-items/{item1_id}",
        headers=headers,
        json={"status": "completed", "priority": "medium"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "completed"
    assert patch_res.json()["priority"] == "medium"

    # 6. DELETE /action-items/{id}
    del_res = await client.delete(f"/api/v1/action-items/{item1_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify item deleted
    get_after = await client.get("/api/v1/action-items", headers=headers)
    assert get_after.json()["total"] == 1
    assert get_after.json()["items"][0]["id"] == str(item2.id)


@pytest.mark.asyncio
async def test_action_items_isolation_404(client: AsyncClient, db_session):
    token1 = await create_user_and_token(client, "ai_iso1@example.com")
    token2 = await create_user_and_token(client, "ai_iso2@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token1}"})
    user1_id = uuid.UUID(me_res.json()["id"])

    meeting1 = Meeting(id=uuid.uuid4(), user_id=user1_id, title="User1 Meeting")
    item1 = ActionItem(
        id=uuid.uuid4(),
        meeting_id=meeting1.id,
        user_id=user1_id,
        description="Confidential task",
    )
    db_session.add_all([meeting1, item1])
    await db_session.commit()

    # User 2 tries to PATCH or DELETE User 1's action item -> 404
    patch_res = await client.patch(
        f"/api/v1/action-items/{item1.id}",
        headers={"Authorization": f"Bearer {token2}"},
        json={"description": "Hacked"},
    )
    assert patch_res.status_code == 404

    del_res = await client.delete(
        f"/api/v1/action-items/{item1.id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert del_res.status_code == 404
