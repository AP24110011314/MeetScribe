import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.db.models import Webhook, WebhookDelivery

logger = logging.getLogger(__name__)


def validate_webhook_url(url: str) -> None:
    """
    Validates target URL against Server-Side Request Forgery (SSRF).
    Only allows http/https schemes.
    Resolves hostname to IP and rejects:
      - Loopback (127.0.0.0/8, ::1)
      - Private addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7)
      - Link-local (169.254.0.0/16, fe80::/10)
      - Multicast, broadcast, reserved, unspecified (0.0.0.0/8, ::)
    """
    try:
        parsed = urllib.parse.urlsplit(url)
    except Exception as exc:
        raise ValueError(f"Invalid webhook URL format: {exc}")

    if parsed.scheme.lower() not in ("http", "https"):
        raise ValueError("Webhook URL scheme must be http or https")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Webhook URL missing valid hostname")

    # Reject obvious local addresses immediately
    if hostname.lower() in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        raise ValueError("Webhook destination to local host is not permitted")

    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)

    try:
        addr_infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError(f"Could not resolve webhook host '{hostname}': {exc}")

    if not addr_infos:
        raise ValueError(f"No IP addresses resolved for hostname '{hostname}'")

    for info in addr_infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            raise ValueError(f"Invalid resolved IP address '{ip_str}'")

        if (
            ip.is_loopback
            or ip.is_private
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError(
                f"Destination IP '{ip_str}' belongs to a private, loopback, or reserved network and cannot receive webhooks."
            )


def sign_payload(secret: str, payload_bytes: bytes) -> str:
    """
    Computes HMAC-SHA256 hex digest for outbound webhook payloads.
    """
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


async def send_single_webhook_async(
    webhook: Webhook,
    event: str,
    payload: Dict[str, Any],
    db: AsyncSession,
) -> WebhookDelivery:
    """
    Sends an async webhook request with HMAC signature and records the delivery attempt.
    """
    payload_json = json.dumps(payload, default=str, sort_keys=True)
    payload_bytes = payload_json.encode("utf-8")
    signature = sign_payload(webhook.secret, payload_bytes)

    headers = {
        "Content-Type": "application/json",
        "X-MeetScribe-Signature": f"sha256={signature}",
        "X-MeetScribe-Event": event,
        "User-Agent": "MeetScribe-Webhooks/1.0",
    }

    delivery = WebhookDelivery(
        id=uuid.uuid4(),
        webhook_id=webhook.id,
        event=event,
        payload=payload,
        created_at=datetime.now(timezone.utc),
    )

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            resp = await client.post(webhook.url, content=payload_bytes, headers=headers)
            delivery.status_code = resp.status_code
            delivery.response_body = resp.text[:1000] if resp.text else ""
            delivery.success = 200 <= resp.status_code < 300
    except Exception as exc:
        delivery.status_code = None
        delivery.response_body = f"Delivery failed: {str(exc)}"[:1000]
        delivery.success = False

    db.add(delivery)
    await db.commit()
    await db.refresh(delivery)
    return delivery


def send_single_webhook_sync(
    webhook: Webhook,
    event: str,
    payload: Dict[str, Any],
    session: Session,
) -> WebhookDelivery:
    """
    Synchronous webhook delivery used in Celery worker tasks.
    """
    payload_json = json.dumps(payload, default=str, sort_keys=True)
    payload_bytes = payload_json.encode("utf-8")
    signature = sign_payload(webhook.secret, payload_bytes)

    headers = {
        "Content-Type": "application/json",
        "X-MeetScribe-Signature": f"sha256={signature}",
        "X-MeetScribe-Event": event,
        "User-Agent": "MeetScribe-Webhooks/1.0",
    }

    delivery = WebhookDelivery(
        id=uuid.uuid4(),
        webhook_id=webhook.id,
        event=event,
        payload=payload,
        created_at=datetime.now(timezone.utc),
    )

    try:
        with httpx.Client(timeout=10.0, follow_redirects=False) as client:
            resp = client.post(webhook.url, content=payload_bytes, headers=headers)
            delivery.status_code = resp.status_code
            delivery.response_body = resp.text[:1000] if resp.text else ""
            delivery.success = 200 <= resp.status_code < 300
    except Exception as exc:
        delivery.status_code = None
        delivery.response_body = f"Delivery failed: {str(exc)}"[:1000]
        delivery.success = False

    session.add(delivery)
    session.commit()
    return delivery


def dispatch_webhooks_sync(
    session: Session,
    user_id: uuid.UUID,
    event: str,
    payload: Dict[str, Any],
) -> List[WebhookDelivery]:
    """
    Dispatches webhooks synchronously to all active endpoints registered by user_id for this event.
    """
    stmt = select(Webhook).where(
        Webhook.user_id == user_id,
        Webhook.is_active.is_(True),
    )
    webhooks = session.execute(stmt).scalars().all()
    deliveries = []
    for wh in webhooks:
        if event in wh.events:
            try:
                delivery = send_single_webhook_sync(wh, event, payload, session)
                deliveries.append(delivery)
            except Exception as exc:
                logger.warning("Failed to dispatch webhook %s: %s", wh.id, exc)
    return deliveries
