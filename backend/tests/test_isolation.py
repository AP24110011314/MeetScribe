import uuid
from typing import Annotated

import pytest
from fastapi import APIRouter, Depends, status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_owned_action_item, get_owned_meeting
from app.db.models import ActionItem, Meeting
from app.main import app

# Test routes to verify isolation dependencies
isolation_test_router = APIRouter(prefix="/test-isolation", tags=["TestIsolation"])


@isolation_test_router.get("/meetings/{meeting_id}")
async def get_test_meeting(meeting: Annotated[Meeting, Depends(get_owned_meeting)]):
    return {"id": str(meeting.id), "title": meeting.title}


@isolation_test_router.delete("/meetings/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_meeting(meeting: Annotated[Meeting, Depends(get_owned_meeting)]):
    return None


@isolation_test_router.get("/action-items/{item_id}")
async def get_test_action_item(item: Annotated[ActionItem, Depends(get_owned_action_item)]):
    return {"id": str(item.id), "description": item.description}


app.include_router(isolation_test_router)


@pytest.mark.asyncio
async def test_user_cannot_access_other_users_meeting(
    client: AsyncClient, db_session: AsyncSession
):
    # 1. Register User A and User B
    res_a = await client.post(
        "/api/v1/auth/register",
        json={"email": "user_a@example.com", "password": "password123"},
    )
    user_a_id = uuid.UUID(res_a.json()["id"])

    await client.post(
        "/api/v1/auth/register",
        json={"email": "user_b@example.com", "password": "password123"},
    )

    # Login both users
    login_a = await client.post(
        "/api/v1/auth/login",
        json={"email": "user_a@example.com", "password": "password123"},
    )
    token_a = login_a.json()["access_token"]

    login_b = await client.post(
        "/api/v1/auth/login",
        json={"email": "user_b@example.com", "password": "password123"},
    )
    token_b = login_b.json()["access_token"]

    # 2. Create a meeting owned by User A
    meeting_a = Meeting(
        user_id=user_a_id,
        title="User A Secret Strategy",
        status="done",
    )
    db_session.add(meeting_a)
    await db_session.commit()
    await db_session.refresh(meeting_a)

    # 3. User A can access their meeting
    response_a = await client.get(
        f"/test-isolation/meetings/{meeting_a.id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert response_a.status_code == 200
    assert response_a.json()["title"] == "User A Secret Strategy"

    # 4. User B gets strict 404 (NOT 403 or 200) when accessing User A's meeting
    response_b = await client.get(
        f"/test-isolation/meetings/{meeting_a.id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert response_b.status_code == 404
    assert response_b.json()["detail"] == "Meeting not found"

    # 5. User B gets strict 404 when attempting to delete User A's meeting
    response_del_b = await client.delete(
        f"/test-isolation/meetings/{meeting_a.id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert response_del_b.status_code == 404


@pytest.mark.asyncio
async def test_user_cannot_access_other_users_action_item(
    client: AsyncClient, db_session: AsyncSession
):
    # 1. Register User A and User B
    res_a = await client.post(
        "/api/v1/auth/register",
        json={"email": "usera2@example.com", "password": "password123"},
    )
    user_a_id = uuid.UUID(res_a.json()["id"])

    await client.post(
        "/api/v1/auth/register",
        json={"email": "userb2@example.com", "password": "password123"},
    )

    login_b = await client.post(
        "/api/v1/auth/login",
        json={"email": "userb2@example.com", "password": "password123"},
    )
    token_b = login_b.json()["access_token"]

    # 2. Create Meeting and ActionItem for User A
    meeting_a = Meeting(user_id=user_a_id, title="Meeting A", status="done")
    db_session.add(meeting_a)
    await db_session.flush()

    item_a = ActionItem(
        meeting_id=meeting_a.id,
        user_id=user_a_id,
        description="Private action item",
    )
    db_session.add(item_a)
    await db_session.commit()
    await db_session.refresh(item_a)

    # 3. User B gets 404 trying to read User A's action item
    res_item_b = await client.get(
        f"/test-isolation/action-items/{item_a.id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_item_b.status_code == 404
    assert res_item_b.json()["detail"] == "Action item not found"
