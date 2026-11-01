import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Meeting, Summary, Transcript
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_ai_features_chat_stream_and_history(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token = await create_user_and_token(client, "ai_chat_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # Create test meeting with transcript and summary
    meeting = Meeting(
        user_id=user_id,
        title="Weekly Sprint Architecture Review",
        status="done",
        duration_sec=300,
    )
    db_session.add(meeting)
    await db_session.flush()

    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Welcome to the sprint review. We decided to launch beta on November 15th [[01:15]].",
        segments=[
            {"id": 0, "start": 0.0, "end": 10.0, "text": "Welcome to the sprint review."},
            {
                "id": 1,
                "start": 70.0,
                "end": 80.0,
                "text": "We decided to launch beta on November 15th.",
            },
        ],
    )
    summary = Summary(
        meeting_id=meeting.id,
        summary="Sprint review summary with beta launch on Nov 15th.",
        key_points=["Beta launch target confirmed"],
        decisions=["Launch on Nov 15th"],
    )
    db_session.add(transcript)
    db_session.add(summary)
    await db_session.commit()

    # 1. Stream chat
    chat_resp = await client.post(
        f"/api/v1/meetings/{meeting.id}/chat",
        headers=headers,
        json={"message": "When is the beta launch?"},
    )
    assert chat_resp.status_code == 200
    assert "text/event-stream" in chat_resp.headers["content-type"]
    body = chat_resp.text
    assert "data: " in body
    assert "token" in body or "done" in body

    # 2. Check chat history
    hist_resp = await client.get(
        f"/api/v1/meetings/{meeting.id}/chat/history",
        headers=headers,
    )
    assert hist_resp.status_code == 200
    data = hist_resp.json()
    assert len(data["messages"]) >= 2
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][0]["content"] == "When is the beta launch?"
    assert data["messages"][1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_ai_features_global_chat(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token = await create_user_and_token(client, "ai_global_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        user_id=user_id,
        title="Apollo Mission Sync",
        status="done",
        duration_sec=600,
    )
    db_session.add(meeting)
    await db_session.flush()

    summary = Summary(
        meeting_id=meeting.id,
        summary="Apollo mission parameters and rocket fuel budget.",
        key_points=["Apollo launch scheduled"],
        decisions=["Review budget by Wednesday"],
    )
    db_session.add(summary)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/chat/global",
        headers=headers,
        json={"query": "What is the update on Apollo?"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "answer" in data
    assert len(data["references"]) >= 1
    assert data["references"][0]["title"] == "Apollo Mission Sync"


@pytest.mark.asyncio
async def test_ai_features_template_regenerate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token = await create_user_and_token(client, "ai_template_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        user_id=user_id,
        title="Daily Standup",
        status="done",
        duration_sec=120,
    )
    db_session.add(meeting)
    await db_session.flush()

    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Yesterday I fixed the auth bug. Today I am updating the docs. No blockers.",
        segments=[],
    )
    db_session.add(transcript)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/meetings/{meeting.id}/regenerate",
        headers=headers,
        json={"template": "standup"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["template"] == "standup"
    assert data["summary"] is not None


@pytest.mark.asyncio
async def test_ai_features_chapters_and_caching(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token = await create_user_and_token(client, "ai_chapters_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        user_id=user_id,
        title="Chapters Test Meeting",
        status="done",
        duration_sec=600,
    )
    db_session.add(meeting)
    await db_session.flush()

    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Chapter 1 introduction. Chapter 2 architecture discussion.",
        segments=[],
    )
    db_session.add(transcript)
    await db_session.commit()

    # Call 1: generates and caches
    resp1 = await client.get(
        f"/api/v1/meetings/{meeting.id}/chapters",
        headers=headers,
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert len(data1["chapters"]) >= 1

    # Call 2: hits cache
    resp2 = await client.get(
        f"/api/v1/meetings/{meeting.id}/chapters",
        headers=headers,
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2 == data1


@pytest.mark.asyncio
async def test_ai_features_followup_email(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token = await create_user_and_token(client, "ai_email_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        user_id=user_id,
        title="Email Test Meeting",
        status="done",
        duration_sec=300,
    )
    db_session.add(meeting)
    await db_session.flush()

    summary = Summary(
        meeting_id=meeting.id,
        summary="Discussed beta release timeline.",
        key_points=["November 15th release"],
        decisions=["Proceed as planned"],
    )
    db_session.add(summary)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/meetings/{meeting.id}/email",
        headers=headers,
        json={"tone": "friendly"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "subject" in data
    assert "body" in data


@pytest.mark.asyncio
async def test_ai_features_translation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token = await create_user_and_token(client, "ai_trans_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        user_id=user_id,
        title="Translation Test",
        status="done",
        duration_sec=300,
    )
    db_session.add(meeting)
    await db_session.flush()

    summary = Summary(
        meeting_id=meeting.id,
        summary="Weekly team sync.",
        key_points=["Point 1"],
        decisions=["Decision 1"],
    )
    db_session.add(summary)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/meetings/{meeting.id}/translate",
        headers=headers,
        json={"target_language": "es"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["language"] == "Spanish"
    assert "summary" in data


@pytest.mark.asyncio
async def test_ai_features_insights(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token = await create_user_and_token(client, "ai_insights_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        user_id=user_id,
        title="Insights Test",
        status="done",
        duration_sec=300,
    )
    db_session.add(meeting)
    await db_session.flush()

    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Hello everyone, how are we feeling about the beta release? It is going well.",
        segments=[],
    )
    db_session.add(transcript)
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/meetings/{meeting.id}/insights",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "sentiment" in data
    assert "pace_wpm" in data
    assert "top_keywords" in data


@pytest.mark.asyncio
async def test_ai_features_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token = await create_user_and_token(client, "ai_iso_user1@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Meeting belongs to another user
    token2 = await create_user_and_token(client, "ai_iso_user2@example.com")
    headers2 = {"Authorization": f"Bearer {token2}"}
    me_res2 = await client.get("/api/v1/auth/me", headers=headers2)
    other_user_id = uuid.UUID(me_res2.json()["id"])

    other_meeting = Meeting(
        user_id=other_user_id,
        title="Secret Other User Meeting",
        status="done",
    )
    db_session.add(other_meeting)
    await db_session.commit()

    # User 1 tries to access User 2's meeting AI endpoints -> 404
    resp = await client.get(
        f"/api/v1/meetings/{other_meeting.id}/chapters",
        headers=headers,
    )
    assert resp.status_code == 404

    resp_chat = await client.post(
        f"/api/v1/meetings/{other_meeting.id}/chat",
        headers=headers,
        json={"message": "What did you discuss?"},
    )
    assert resp_chat.status_code == 404
