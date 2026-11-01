import hashlib
import hmac
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.db.models import Webhook, WebhookDelivery
from app.services.webhooks import sign_payload, validate_webhook_url
from tests.conftest import create_user_and_token


def test_ssrf_validator():
    # Loopback & private IPs must fail
    with pytest.raises(ValueError):
        validate_webhook_url("http://127.0.0.1:8000/hook")

    with pytest.raises(ValueError):
        validate_webhook_url("http://localhost:3000/hook")

    with pytest.raises(ValueError):
        validate_webhook_url("http://10.0.0.5/hook")

    with pytest.raises(ValueError):
        validate_webhook_url("http://192.168.1.100/hook")

    with pytest.raises(ValueError):
        validate_webhook_url("http://172.16.0.1/hook")

    with pytest.raises(ValueError):
        validate_webhook_url("http://169.254.169.254/meta-data")

    # Non-http schemes must fail
    with pytest.raises(ValueError):
        validate_webhook_url("ftp://example.com/hook")


def test_hmac_signature():
    secret = "testsecret123"
    payload = b'{"hello":"world"}'
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    assert sign_payload(secret, payload) == expected


@pytest.mark.asyncio
async def test_webhook_endpoints_and_delivery(client: AsyncClient, db_session):
    token = await create_user_and_token(client, "webhook_user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. SSRF rejection via POST /webhooks
    bad_res = await client.post(
        "/api/v1/webhooks",
        json={"url": "http://127.0.0.1:9000/hook", "events": ["meeting.completed"]},
        headers=headers,
    )
    assert bad_res.status_code == 400
    assert "Invalid webhook URL" in bad_res.json()["detail"]

    # 2. Register valid webhook (mocked hostname resolution if necessary, or example.com)
    with patch("app.services.webhooks.validate_webhook_url") as mock_val:
        mock_val.return_value = None
        create_res = await client.post(
            "/api/v1/webhooks",
            json={
                "url": "https://example.com/my-webhook",
                "events": ["meeting.completed", "action_item.created"],
            },
            headers=headers,
        )
        assert create_res.status_code == 201
        wh_data = create_res.json()
        assert wh_data["url"] == "https://example.com/my-webhook"
        assert wh_data["secret"] is not None
        wh_id = wh_data["id"]

    # 3. List webhooks
    list_res = await client.get("/api/v1/webhooks", headers=headers)
    assert list_res.status_code == 200
    all_wh = list_res.json()
    assert len(all_wh) == 1
    assert all_wh[0]["id"] == wh_id

    # 4. Test webhook ping with mocked send_single_webhook_async
    mock_delivery = WebhookDelivery(
        id=uuid.uuid4(),
        webhook_id=wh_id,
        event="ping",
        payload={"event": "ping"},
        status_code=200,
        response_body="OK",
        success=True,
        attempts=1,
        created_at=datetime.now(timezone.utc),
    )
    with patch(
        "app.api.v1.webhooks.send_single_webhook_async", new_callable=AsyncMock
    ) as mock_send:
        mock_send.return_value = mock_delivery

        test_res = await client.post(f"/api/v1/webhooks/{wh_id}/test", headers=headers)
        assert test_res.status_code == 200
        deliv = test_res.json()
        assert deliv["event"] == "ping"
        assert deliv["status_code"] == 200
        assert deliv["success"] is True
        mock_send.assert_awaited_once()

    # 5. List deliveries (add mock_delivery to DB to verify listing)
    db_session.add(mock_delivery)
    await db_session.commit()

    deliv_res = await client.get(f"/api/v1/webhooks/{wh_id}/deliveries", headers=headers)
    assert deliv_res.status_code == 200
    deliv_list = deliv_res.json()
    assert len(deliv_list) == 1
    assert deliv_list[0]["event"] == "ping"
    assert deliv_list[0]["status_code"] == 200

    # 6. Delete webhook
    del_res = await client.delete(f"/api/v1/webhooks/{wh_id}", headers=headers)
    assert del_res.status_code == 204

    # 7. Check list is empty
    list_after = await client.get("/api/v1/webhooks", headers=headers)
    assert len(list_after.json()) == 0


@pytest.mark.asyncio
async def test_webhook_ownership(client: AsyncClient, db_session):
    owner_token = await create_user_and_token(client, "owner_wh@example.com")
    other_token = await create_user_and_token(client, "other_wh@example.com")

    me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {owner_token}"})
    owner_id = uuid.UUID(me_res.json()["id"])

    wh = Webhook(
        id=uuid.uuid4(),
        user_id=owner_id,
        url="https://example.com/owner-hook",
        secret="secret123",
        events=["meeting.completed"],
        is_active=True,
    )
    db_session.add(wh)
    await db_session.commit()

    # Other user cannot test or delete
    test_res = await client.post(
        f"/api/v1/webhooks/{wh.id}/test",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert test_res.status_code == 404

    del_res = await client.delete(
        f"/api/v1/webhooks/{wh.id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert del_res.status_code == 404
