import uuid

import pytest
from httpx import AsyncClient

from app.db.models import Meeting, Transcript


async def create_user_and_token(client: AsyncClient, email: str) -> str:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_list_meetings_pagination_and_sorting(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "list_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch user id
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # Create 5 meetings with different titles and durations
    meetings = [
        Meeting(
            id=uuid.uuid4(),
            user_id=user_id,
            title="Alpha Project",
            duration_sec=100.0,
            status="done",
        ),
        Meeting(
            id=uuid.uuid4(), user_id=user_id, title="Beta Sync", duration_sec=250.0, status="done"
        ),
        Meeting(
            id=uuid.uuid4(),
            user_id=user_id,
            title="Gamma Review",
            duration_sec=50.0,
            status="queued",
        ),
        Meeting(
            id=uuid.uuid4(),
            user_id=user_id,
            title="Delta Standup",
            duration_sec=300.0,
            status="done",
        ),
        Meeting(
            id=uuid.uuid4(),
            user_id=user_id,
            title="Epsilon Kickoff",
            duration_sec=150.0,
            status="failed",
        ),
    ]
    db_session.add_all(meetings)
    await db_session.commit()

    # 1. Page 1, page_size 2
    res1 = await client.get("/api/v1/meetings?page=1&page_size=2", headers=headers)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["total"] == 5
    assert len(data1["items"]) == 2
    assert data1["page"] == 1
    assert data1["page_size"] == 2

    # 2. Sort by title asc
    res_sort = await client.get(
        "/api/v1/meetings?sort=title&order=asc&page=1&page_size=10", headers=headers
    )
    assert res_sort.status_code == 200
    titles = [item["title"] for item in res_sort.json()["items"]]
    assert titles == [
        "Alpha Project",
        "Beta Sync",
        "Delta Standup",
        "Epsilon Kickoff",
        "Gamma Review",
    ]

    # 3. Sort by duration desc
    res_dur = await client.get("/api/v1/meetings?sort=duration&order=desc", headers=headers)
    durations = [item["duration_sec"] for item in res_dur.json()["items"]]
    assert durations == [300.0, 250.0, 150.0, 100.0, 50.0]

    # 4. Status filter: done
    res_done = await client.get("/api/v1/meetings?status=done", headers=headers)
    assert res_done.json()["total"] == 3
    for item in res_done.json()["items"]:
        assert item["status"] == "done"


@pytest.mark.asyncio
async def test_list_meetings_search_title_and_transcript(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "search_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    m1 = Meeting(id=uuid.uuid4(), user_id=user_id, title="Security Architecture", status="done")
    m2 = Meeting(id=uuid.uuid4(), user_id=user_id, title="General Discussion", status="done")
    db_session.add_all([m1, m2])
    await db_session.commit()

    # Add transcript mentioning "kubernetes" to m2
    tr = Transcript(
        meeting_id=m2.id,
        full_text="We need to migrate our microservices to Kubernetes clusters next month.",
        segments=[],
        model="fake",
    )
    db_session.add(tr)
    await db_session.commit()

    # Search for "Security" (matches title of m1)
    res_q1 = await client.get("/api/v1/meetings?q=Security", headers=headers)
    assert res_q1.status_code == 200
    assert res_q1.json()["total"] == 1
    assert res_q1.json()["items"][0]["id"] == str(m1.id)

    # Search for "Kubernetes" (matches transcript of m2)
    res_q2 = await client.get("/api/v1/meetings?q=Kubernetes", headers=headers)
    assert res_q2.status_code == 200
    assert res_q2.json()["total"] == 1
    assert res_q2.json()["items"][0]["id"] == str(m2.id)


@pytest.mark.asyncio
async def test_list_meetings_user_isolation(client: AsyncClient, db_session):
    token1 = await create_user_and_token(client, "user_iso1@example.com")
    token2 = await create_user_and_token(client, "user_iso2@example.com")

    # User 1 creates a meeting
    res = await client.post(
        "/api/v1/meetings",
        headers={"Authorization": f"Bearer {token1}"},
        json={"filename": "secret.mp3", "content_type": "audio/mpeg", "size_bytes": 100},
    )
    assert res.status_code == 201

    # User 2 lists meetings -> should be empty
    res2 = await client.get(
        "/api/v1/meetings",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res2.status_code == 200
    assert res2.json()["total"] == 0
    assert len(res2.json()["items"]) == 0
