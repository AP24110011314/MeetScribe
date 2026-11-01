import io
import uuid
from datetime import date

import docx
import pytest
from httpx import AsyncClient

from app.db.models import ActionItem, Meeting, Summary, Transcript
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_export_all_formats(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "export_all_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Q3 Roadmap Planning",
        status="done",
        duration_sec=3600.0,
    )
    db_session.add(meeting)
    await db_session.flush()

    summary = Summary(
        meeting_id=meeting.id,
        summary="Discussed Q3 deliverables and hiring plans.",
        key_points=["Prioritize core API", "Refactor data ingestion"],
        decisions=["Adopt PostgreSQL for vector search"],
        llm_model="fake",
    )
    item = ActionItem(
        meeting_id=meeting.id,
        user_id=user_id,
        description="Write architecture RFC",
        owner="Alice",
        due_date=date(2026, 11, 15),
        priority="high",
        status="todo",
        created_by_ai=True,
    )
    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Good morning everyone. Let's discuss Q3 deliverables.",
        segments=[
            {"id": 0, "start": 0.0, "end": 2.5, "text": "Good morning everyone."},
            {"id": 1, "start": 2.5, "end": 6.0, "text": "Let's discuss Q3 deliverables."},
        ],
        model="fake",
    )
    db_session.add_all([summary, item, transcript])
    await db_session.commit()

    # 1. Export Markdown
    res_md = await client.get(f"/api/v1/meetings/{meeting.id}/export?format=md", headers=headers)
    assert res_md.status_code == 200
    assert "text/markdown" in res_md.headers["content-type"]
    assert 'filename="Q3_Roadmap_Planning.md"' in res_md.headers["content-disposition"]
    assert "# Q3 Roadmap Planning" in res_md.text

    # 2. Export PDF
    res_pdf = await client.get(f"/api/v1/meetings/{meeting.id}/export?format=pdf", headers=headers)
    assert res_pdf.status_code == 200
    assert "application/pdf" in res_pdf.headers["content-type"]
    assert res_pdf.content.startswith(b"%PDF")

    # 3. Export DOCX
    res_docx = await client.get(
        f"/api/v1/meetings/{meeting.id}/export?format=docx", headers=headers
    )
    assert res_docx.status_code == 200
    assert "officedocument.wordprocessingml" in res_docx.headers["content-type"]
    doc = docx.Document(io.BytesIO(res_docx.content))
    doc_text = "\n".join([p.text for p in doc.paragraphs])
    assert "Q3 Roadmap Planning" in doc_text

    # 4. Export TXT
    res_txt = await client.get(f"/api/v1/meetings/{meeting.id}/export?format=txt", headers=headers)
    assert res_txt.status_code == 200
    assert "text/plain" in res_txt.headers["content-type"]
    assert "Q3 ROADMAP PLANNING" in res_txt.text
    assert "EXECUTIVE SUMMARY" in res_txt.text

    # 5. Export JSON
    res_json = await client.get(
        f"/api/v1/meetings/{meeting.id}/export?format=json", headers=headers
    )
    assert res_json.status_code == 200
    data = res_json.json()
    assert data["title"] == "Q3 Roadmap Planning"
    assert len(data["action_items"]) == 1
    assert data["action_items"][0]["owner"] == "Alice"

    # 6. Export SRT
    res_srt = await client.get(f"/api/v1/meetings/{meeting.id}/export?format=srt", headers=headers)
    assert res_srt.status_code == 200
    assert "00:00:00,000 --> 00:00:02,500" in res_srt.text
    assert "Good morning everyone." in res_srt.text

    # 7. Export VTT
    res_vtt = await client.get(f"/api/v1/meetings/{meeting.id}/export?format=vtt", headers=headers)
    assert res_vtt.status_code == 200
    assert "WEBVTT" in res_vtt.text
    assert "00:00:00.000 --> 00:00:02.500" in res_vtt.text

    # 8. Export ICS
    res_ics = await client.get(f"/api/v1/meetings/{meeting.id}/export?format=ics", headers=headers)
    assert res_ics.status_code == 200
    assert "BEGIN:VCALENDAR" in res_ics.text
    assert "Action: Write architecture RFC" in res_ics.text
    assert "DTSTART;VALUE=DATE:20261115" in res_ics.text


@pytest.mark.asyncio
async def test_export_conflict_and_invalid_format(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "export_err@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Processing Meeting",
        status="processing",
    )
    db_session.add(meeting)
    await db_session.commit()

    # Exporting non-done meeting -> 409
    res_conflict = await client.get(
        f"/api/v1/meetings/{meeting.id}/export?format=md", headers=headers
    )
    assert res_conflict.status_code == 409

    # Invalid format -> 422
    res_invalid = await client.get(
        f"/api/v1/meetings/{meeting.id}/export?format=invalid_fmt", headers=headers
    )
    assert res_invalid.status_code == 422


@pytest.mark.asyncio
async def test_export_ownership(client: AsyncClient, db_session):
    owner_token = await create_user_and_token(client, "owner_exp@example.com")
    other_token = await create_user_and_token(client, "other_exp@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {owner_token}"})
    owner_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=owner_id,
        title="Secret Meeting",
        status="done",
    )
    db_session.add(meeting)
    await db_session.commit()

    # Other user cannot export -> 404
    res = await client.get(
        f"/api/v1/meetings/{meeting.id}/export?format=md",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 404
