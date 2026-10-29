import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Meeting, Transcript


async def create_user_and_token(client: AsyncClient, email: str) -> str:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_get_transcript_and_segment_search(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "tr_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(id=uuid.uuid4(), user_id=user_id, title="Product Sync", status="done")
    db_session.add(meeting)
    await db_session.commit()

    segments = [
        {"id": 0, "start": 0.0, "end": 4.5, "text": "Welcome to the weekly meeting."},
        {"id": 1, "start": 4.5, "end": 9.2, "text": "Priya will update the documentation."},
        {"id": 2, "start": 9.2, "end": 14.0, "text": "Ravi is working on backend performance."},
        {
            "id": 3,
            "start": 14.0,
            "end": 18.5,
            "text": "Priya also reviewed the open pull requests.",
        },
    ]
    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Welcome to the weekly meeting. Priya will update the documentation. Ravi is working on backend performance. Priya also reviewed the open pull requests.",
        segments=segments,
        model="fake",
    )
    db_session.add(transcript)
    await db_session.commit()

    # 1. Full transcript without search
    res = await client.get(f"/api/v1/meetings/{meeting.id}/transcript", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["segments"]) == 4
    assert data["matching_segment_ids"] is None
    assert "weekly meeting" in data["full_text"]

    # 2. Search for "Priya" (matches segments 1 and 3)
    res_search = await client.get(
        f"/api/v1/meetings/{meeting.id}/transcript?q=Priya", headers=headers
    )
    assert res_search.status_code == 200
    data_search = res_search.json()
    assert data_search["matching_segment_ids"] == [1, 3]

    # 3. Search for non-existent term
    res_none = await client.get(
        f"/api/v1/meetings/{meeting.id}/transcript?q=nonexistentterm", headers=headers
    )
    assert res_none.status_code == 200
    assert res_none.json()["matching_segment_ids"] == []


@pytest.mark.asyncio
async def test_get_transcript_missing_404(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "tr_missing@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # Meeting without transcript
    meeting = Meeting(id=uuid.uuid4(), user_id=user_id, title="No Transcript", status="queued")
    db_session.add(meeting)
    await db_session.commit()

    res = await client.get(f"/api/v1/meetings/{meeting.id}/transcript", headers=headers)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
