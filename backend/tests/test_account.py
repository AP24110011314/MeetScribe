import io
import json
import uuid
import zipfile
from datetime import date

import pytest
from httpx import AsyncClient

from app.db.models import ActionItem, Meeting, Summary, Transcript
from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_account_data_export(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "export_acc_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # Setup meeting and action item
    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Account Export Meeting",
        status="done",
        duration_sec=1200.0,
    )
    db_session.add(meeting)
    await db_session.flush()

    summary = Summary(
        meeting_id=meeting.id,
        summary="Executive summary for account export.",
        key_points=["Point 1", "Point 2"],
        decisions=["Decision 1"],
        llm_model="fake",
    )
    item = ActionItem(
        meeting_id=meeting.id,
        user_id=user_id,
        description="Follow up on account export",
        owner="Alice",
        due_date=date(2026, 11, 20),
        priority="high",
        status="todo",
        created_by_ai=True,
    )
    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="This is a test transcript for full export.",
        segments=[
            {
                "id": 0,
                "start": 0.0,
                "end": 4.0,
                "text": "This is a test transcript for full export.",
            }
        ],
        model="fake",
    )
    db_session.add_all([summary, item, transcript])
    await db_session.commit()

    # Request ZIP export
    res = await client.get("/api/v1/account/export", headers=headers)
    assert res.status_code == 200
    assert "application/zip" in res.headers["content-type"]
    assert "meetscribe_export_" in res.headers["content-disposition"]

    # Verify contents of zip file
    zf = zipfile.ZipFile(io.BytesIO(res.content))
    file_list = zf.namelist()

    assert any(f.startswith("meetings/") and f.endswith(".json") for f in file_list)
    assert any(f.startswith("meetings/") and f.endswith(".md") for f in file_list)
    assert "action_items.csv" in file_list
    assert "action_items.ics" in file_list
    assert "export_summary.json" in file_list

    # Verify manifest
    manifest_data = json.loads(zf.read("export_summary.json").decode())
    assert manifest_data["total_meetings"] == 1
    assert manifest_data["total_action_items"] == 1

    # Verify CSV content
    csv_text = zf.read("action_items.csv").decode()
    assert "Follow up on account export" in csv_text
    assert "Alice" in csv_text


@pytest.mark.asyncio
async def test_account_delete_cascade(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "delete_acc_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    user_id = uuid.UUID(me_res.json()["id"])

    # Create meeting
    meeting = Meeting(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Will Be Deleted",
        status="done",
    )
    db_session.add(meeting)
    await db_session.commit()

    # Delete account
    del_res = await client.delete("/api/v1/account", headers=headers)
    assert del_res.status_code == 204

    # Subsequent request using the deleted user's token should fail (user no longer exists)
    after_res = await client.get("/api/v1/auth/me", headers=headers)
    assert after_res.status_code == 401
