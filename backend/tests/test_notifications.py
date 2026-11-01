import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Notification
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_notifications_lifecycle(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "notif_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # 1. Create two sample notifications
    n1 = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        type="meeting_completed",
        title="Meeting Ready: Q3 Planning",
        message="Notes and summary are ready",
        link_url="/meetings/123",
        is_read=False,
    )
    n2 = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        type="action_item_due",
        title="Upcoming Action Item",
        message="Task due tomorrow",
        link_url="/meetings/123",
        is_read=False,
    )
    db_session.add_all([n1, n2])
    await db_session.commit()

    # 2. List notifications
    list_res = await client.get("/api/v1/notifications", headers=headers)
    assert list_res.status_code == 200
    data = list_res.json()
    assert data["unread_count"] == 2
    assert len(data["items"]) == 2

    # 3. Mark single notification as read
    patch_res = await client.patch(f"/api/v1/notifications/{n1.id}/read", headers=headers)
    assert patch_res.status_code == 200
    assert patch_res.json()["is_read"] is True

    # Check unread count is now 1
    list_res2 = await client.get("/api/v1/notifications", headers=headers)
    assert list_res2.json()["unread_count"] == 1

    # 4. Mark all as read
    read_all_res = await client.post("/api/v1/notifications/read-all", headers=headers)
    assert read_all_res.status_code == 200
    assert read_all_res.json()["marked_count"] >= 1

    list_res3 = await client.get("/api/v1/notifications", headers=headers)
    assert list_res3.json()["unread_count"] == 0


@pytest.mark.asyncio
async def test_notifications_ownership(client: AsyncClient, db_session):
    owner_token = await create_user_and_token(client, "owner_notif@example.com")
    other_token = await create_user_and_token(client, "other_notif@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {owner_token}"})
    owner_id = uuid.UUID(me_res.json()["id"])

    notif = Notification(
        id=uuid.uuid4(),
        user_id=owner_id,
        type="meeting_completed",
        title="Owner note",
        message="Secret note",
        is_read=False,
    )
    db_session.add(notif)
    await db_session.commit()

    # Other user cannot mark as read -> 404
    err_res = await client.patch(
        f"/api/v1/notifications/{notif.id}/read",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert err_res.status_code == 404
