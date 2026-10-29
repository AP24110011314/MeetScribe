import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from app.db.models import ActionItem, Meeting, Summary
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_export_markdown_and_pdf(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "export_user@example.com")
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
    db_session.add_all([summary, item])
    await db_session.commit()

    # 1. Export Markdown
    res_md = await client.get(f"/api/v1/meetings/{meeting.id}/export?format=md", headers=headers)
    assert res_md.status_code == 200
    assert "text/markdown" in res_md.headers["content-type"]
    assert 'filename="Q3_Roadmap_Planning.md"' in res_md.headers["content-disposition"]
    md_text = res_md.text
    assert "# Q3 Roadmap Planning" in md_text
    assert "Discussed Q3 deliverables" in md_text
    assert "Prioritize core API" in md_text
    assert "Adopt PostgreSQL" in md_text
    assert "Write architecture RFC" in md_text
    assert "Alice" in md_text

    # 2. Export PDF
    res_pdf = await client.get(f"/api/v1/meetings/{meeting.id}/export?format=pdf", headers=headers)
    assert res_pdf.status_code == 200
    assert "application/pdf" in res_pdf.headers["content-type"]
    assert 'filename="Q3_Roadmap_Planning.pdf"' in res_pdf.headers["content-disposition"]
    assert res_pdf.content.startswith(b"%PDF")


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
        f"/api/v1/meetings/{meeting.id}/export?format=docx", headers=headers
    )
    assert res_invalid.status_code == 422


@pytest.mark.asyncio
async def test_export_isolation(client: AsyncClient, db_session):
    token_owner = await create_user_and_token(client, "export_owner@example.com")
    token_other = await create_user_and_token(client, "export_other@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_owner}"})
    owner_id = uuid.UUID(me_res.json()["id"])

    meeting = Meeting(id=uuid.uuid4(), user_id=owner_id, title="Secret Meeting", status="done")
    db_session.add(meeting)
    await db_session.commit()

    # Other user gets 404
    res = await client.get(
        f"/api/v1/meetings/{meeting.id}/export?format=md",
        headers={"Authorization": f"Bearer {token_other}"},
    )
    assert res.status_code == 404
