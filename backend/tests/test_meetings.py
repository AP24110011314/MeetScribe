"""Upload flow tests (docs/API.md, PRD F1/F2): create, presign, complete, list."""

import pytest
from httpx import AsyncClient

from app.services.meetings import ALLOWED_CONTENT_TYPES
from app.services.storage import PRESIGN_EXPIRES_SEC, audio_object_key
from tests.conftest import FakeStorage


async def _create(client: AsyncClient, headers: dict[str, str], **overrides: object) -> dict:
    payload = {
        "filename": "standup.mp3",
        "content_type": "audio/mpeg",
        "size_bytes": 1024,
    }
    payload.update(overrides)
    resp = await client.post("/api/v1/meetings", json=payload, headers=headers)
    return {"status": resp.status_code, "body": resp.json() if resp.content else {}}


async def test_create_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/meetings",
        json={"filename": "a.mp3", "content_type": "audio/mpeg", "size_bytes": 10},
    )
    assert resp.status_code == 401


async def test_create_returns_presigned_url(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    result = await _create(client, auth_headers)
    assert result["status"] == 201, result
    body = result["body"]
    assert body["expires_in"] == PRESIGN_EXPIRES_SEC
    assert body["upload_headers"] == {"Content-Type": "audio/mpeg"}
    assert "/put/uploads/" in body["upload_url"]
    assert "standup.mp3" in body["upload_url"]


async def test_create_scopes_key_to_user_and_meeting(
    client: AsyncClient, auth_headers: dict[str, str], db_session: object
) -> None:
    result = await _create(client, auth_headers)
    meeting_id = result["body"]["meeting_id"]
    me = await client.get("/api/v1/auth/me", headers=auth_headers)
    user_id = me.json()["id"]
    assert f"/uploads/{user_id}/{meeting_id}/standup.mp3" in result["body"]["upload_url"]


@pytest.mark.parametrize("content_type", ["application/pdf", "text/plain", "image/png"])
async def test_create_rejects_bad_type(
    client: AsyncClient, auth_headers: dict[str, str], content_type: str
) -> None:
    result = await _create(client, auth_headers, content_type=content_type, filename="document.pdf")
    assert result["status"] == 415
    assert result["body"]["code"] == "UNSUPPORTED_TYPE"


async def test_create_accepts_generic_type_with_allowed_extension(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    """Browsers sometimes send application/octet-stream for a valid audio file."""
    result = await _create(
        client, auth_headers, content_type="application/octet-stream", filename="meeting.m4a"
    )
    assert result["status"] == 201


async def test_create_rejects_generic_type_with_bad_extension(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    result = await _create(
        client, auth_headers, content_type="application/octet-stream", filename="notes.txt"
    )
    assert result["status"] == 415


async def test_create_rejects_oversized_file(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    result = await _create(client, auth_headers, size_bytes=600 * 1024 * 1024)
    assert result["status"] == 413
    assert result["body"]["code"] == "FILE_TOO_LARGE"


async def test_allowed_types_includes_prd_formats() -> None:
    for ct in ("audio/mpeg", "audio/wav", "audio/mp4", "audio/webm", "audio/ogg"):
        assert ct in ALLOWED_CONTENT_TYPES


async def test_complete_requires_object_in_storage(
    client: AsyncClient, auth_headers: dict[str, str], fake_storage: FakeStorage
) -> None:
    created = await _create(client, auth_headers)
    meeting_id = created["body"]["meeting_id"]
    resp = await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=auth_headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "UPLOAD_NOT_FOUND"


async def test_complete_sets_status_queued(
    client: AsyncClient, auth_headers: dict[str, str], fake_storage: FakeStorage
) -> None:
    created = await _create(client, auth_headers)
    meeting_id = created["body"]["meeting_id"]
    me = await client.get("/api/v1/auth/me", headers=auth_headers)
    key = audio_object_key(me.json()["id"], meeting_id, "standup.mp3")
    fake_storage.put(key, ContentType="audio/mpeg")

    resp = await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "queued"


async def test_complete_twice_returns_409(
    client: AsyncClient, auth_headers: dict[str, str], fake_storage: FakeStorage
) -> None:
    created = await _create(client, auth_headers)
    meeting_id = created["body"]["meeting_id"]
    me = await client.get("/api/v1/auth/me", headers=auth_headers)
    key = audio_object_key(me.json()["id"], meeting_id, "standup.mp3")
    fake_storage.put(key)

    first = await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=auth_headers)
    assert first.status_code == 200
    second = await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=auth_headers)
    assert second.status_code == 409
    assert second.json()["code"] == "UPLOAD_ALREADY_COMPLETED"


async def test_other_user_cannot_complete(
    client: AsyncClient, auth_headers: dict[str, str], fake_storage: FakeStorage
) -> None:
    created = await _create(client, auth_headers)
    meeting_id = created["body"]["meeting_id"]

    # A second user's token must not reach the first user's meeting.
    other = await client.post(
        "/api/v1/auth/register", json={"email": "other@example.com", "password": "supersecret123"}
    )
    assert other.status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": "other@example.com", "password": "supersecret123"}
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.post(f"/api/v1/meetings/{meeting_id}/complete", headers=other_headers)
    assert resp.status_code == 404


async def test_list_is_owner_scoped_and_paginated(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    for i in range(3):
        await _create(client, auth_headers, filename=f"m{i}.mp3")

    resp = await client.get("/api/v1/meetings?page=1&page_size=2", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert len(body["items"]) == 2


async def test_list_search_matches_title(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _create(client, auth_headers, filename="sprint-planning.mp3")
    await _create(client, auth_headers, filename="retro.mp3")
    resp = await client.get("/api/v1/meetings?q=sprint", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["original_filename"] == "sprint-planning.mp3"


async def test_list_filters_by_status(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _create(client, auth_headers)
    pending = await client.get("/api/v1/meetings?status=pending_upload", headers=auth_headers)
    assert pending.status_code == 200
    assert pending.json()["total"] == 1
    done = await client.get("/api/v1/meetings?status=done", headers=auth_headers)
    assert done.json()["total"] == 0
