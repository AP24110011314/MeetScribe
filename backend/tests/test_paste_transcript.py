import pytest
from httpx import AsyncClient

from tests.conftest import create_user_and_token


@pytest.mark.asyncio
async def test_paste_transcript_pipeline(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "paste_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    sample_transcript = """
    Priya: Let's discuss the project deadline.
    Ravi: I think we can deliver the beta next Wednesday.
    Priya: Agreed. Action item: Ravi will finish the login tests by Friday.
    """

    res = await client.post(
        "/api/v1/meetings/paste",
        json={"title": "Pasted Sync Meeting", "transcript_text": sample_transcript},
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Pasted Sync Meeting"
    assert data["has_transcript"] is True
    meeting_id = data["id"]

    # Verify meeting reached done via Celery eager/worker
    status_res = await client.get(f"/api/v1/meetings/{meeting_id}/status", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["status"] in ("queued", "processing", "analyzing", "done")
