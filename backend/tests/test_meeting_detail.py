import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from app.db.models import ActionItem, Meeting, Summary, Transcript


async def create_user_and_token(client: AsyncClient, email: str) -> str:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_meeting_detail_done_with_summary_and_actions(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "detail_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # 1. Create meeting in done status
    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Sprint Retrospective",
        status="done",
        duration_sec=1832.4,
        language="en",
    )
    db_session.add(meeting)
    await db_session.commit()

    # 2. Add transcript, summary, and action items
    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Great sprint retrospective team.",
        segments=[],
        model="fake",
    )
    summary = Summary(
        meeting_id=meeting.id,
        summary="A productive retrospective covering velocity and blocker resolutions.",
        key_points=["Velocity was high", "Deployment process needs improvement"],
        decisions=["Adopt trunk-based development"],
        llm_model="fake-claude",
    )
    action_item = ActionItem(
        id=uuid.uuid4(),
        meeting_id=meeting.id,
        user_id=user_id,
        description="Configure automated CI lint checks",
        owner="Priya",
        due_date=date(2026, 11, 10),
        priority="high",
        status="open",
        created_by_ai=True,
    )
    db_session.add_all([transcript, summary, action_item])
    await db_session.commit()

    # 3. GET meeting detail
    res = await client.get(f"/api/v1/meetings/{meeting.id}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["id"] == str(meeting.id)
    assert data["title"] == "Sprint Retrospective"
    assert data["status"] == "done"
    assert data["duration_sec"] == 1832.4
    assert data["has_transcript"] is True

    # Check Summary section
    assert data["summary"] is not None
    assert "productive retrospective" in data["summary"]["summary"]
    assert len(data["summary"]["key_points"]) == 2
    assert len(data["summary"]["decisions"]) == 1

    # Check Action Items section
    assert len(data["action_items"]) == 1
    ai = data["action_items"][0]
    assert ai["description"] == "Configure automated CI lint checks"
    assert ai["owner"] == "Priya"
    assert ai["due_date"] == "2026-11-10"
    assert ai["priority"] == "high"


@pytest.mark.asyncio
async def test_meeting_detail_pending_partial(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "pending_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Pending Meeting",
        status="queued",
        progress_pct=5.0,
    )
    db_session.add(meeting)
    await db_session.commit()

    res = await client.get(f"/api/v1/meetings/{meeting.id}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "queued"
    assert data["has_transcript"] is False
    assert data["summary"] is None
    assert data["action_items"] == []


@pytest.mark.asyncio
async def test_meeting_detail_isolation_404(client: AsyncClient, db_session):
    token1 = await create_user_and_token(client, "user_det1@example.com")
    token2 = await create_user_and_token(client, "user_det2@example.com")

    # User 1 creates meeting
    res = await client.post(
        "/api/v1/meetings",
        headers={"Authorization": f"Bearer {token1}"},
        json={"filename": "private.mp3", "content_type": "audio/mpeg", "size_bytes": 100},
    )
    meeting_id = res.json()["meeting_id"]

    # User 2 tries to access User 1's meeting -> 404
    res2 = await client.get(
        f"/api/v1/meetings/{meeting_id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res2.status_code == 404
