import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User, Webhook, WebhookDelivery
from app.db.session import get_db
from app.schemas.sharing import (
    WebhookCreateRequest,
    WebhookDeliveryResponse,
    WebhookResponse,
    WebhookUpdateRequest,
)
from app.services.webhooks import send_single_webhook_async, validate_webhook_url

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.get(
    "",
    response_model=List[WebhookResponse],
    summary="List webhooks for current user",
)
async def list_webhooks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[WebhookResponse]:
    stmt = (
        select(Webhook)
        .where(Webhook.user_id == current_user.id)
        .order_by(Webhook.created_at.desc())
    )
    res = await db.execute(stmt)
    webhooks = res.scalars().all()
    return [WebhookResponse.model_validate(wh) for wh in webhooks]


@router.post(
    "",
    response_model=WebhookResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new webhook endpoint with SSRF validation",
)
async def create_webhook(
    data: WebhookCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WebhookResponse:
    # 1. SSRF validation on target URL
    try:
        validate_webhook_url(data.url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid webhook URL: {exc}",
        )

    # 2. Generate secret and create webhook
    secret = secrets.token_hex(32)
    wh = Webhook(
        id=uuid.uuid4(),
        user_id=current_user.id,
        url=data.url.strip(),
        secret=secret,
        events=data.events,
        is_active=True,
    )
    db.add(wh)
    await db.commit()
    await db.refresh(wh)
    return WebhookResponse.model_validate(wh)


@router.patch(
    "/{webhook_id}",
    response_model=WebhookResponse,
    summary="Update webhook url, events, or active status",
)
async def update_webhook(
    webhook_id: uuid.UUID,
    data: WebhookUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WebhookResponse:
    stmt = select(Webhook).where(Webhook.id == webhook_id, Webhook.user_id == current_user.id)
    res = await db.execute(stmt)
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    if data.url is not None:
        try:
            validate_webhook_url(data.url)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid webhook URL: {exc}",
            )
        wh.url = data.url.strip()

    if data.events is not None:
        wh.events = data.events

    if data.is_active is not None:
        wh.is_active = data.is_active

    await db.commit()
    await db.refresh(wh)
    return WebhookResponse.model_validate(wh)


@router.delete(
    "/{webhook_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a webhook endpoint",
)
async def delete_webhook(
    webhook_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    stmt = select(Webhook).where(Webhook.id == webhook_id, Webhook.user_id == current_user.id)
    res = await db.execute(stmt)
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    await db.delete(wh)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{webhook_id}/test",
    response_model=WebhookDeliveryResponse,
    summary="Send test ping event with HMAC-SHA256 signature to webhook",
)
async def test_webhook(
    webhook_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WebhookDeliveryResponse:
    stmt = select(Webhook).where(Webhook.id == webhook_id, Webhook.user_id == current_user.id)
    res = await db.execute(stmt)
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    test_payload = {
        "event": "ping",
        "message": "Test webhook delivery from MeetScribe",
        "webhook_id": str(wh.id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    delivery = await send_single_webhook_async(wh, "ping", test_payload, db)
    return WebhookDeliveryResponse.model_validate(delivery)


@router.get(
    "/{webhook_id}/deliveries",
    response_model=List[WebhookDeliveryResponse],
    summary="List delivery logs for a webhook",
)
async def list_webhook_deliveries(
    webhook_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[WebhookDeliveryResponse]:
    stmt = select(Webhook).where(Webhook.id == webhook_id, Webhook.user_id == current_user.id)
    res = await db.execute(stmt)
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    deliv_stmt = (
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == wh.id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(50)
    )
    d_res = await db.execute(deliv_stmt)
    deliveries = d_res.scalars().all()
    return [WebhookDeliveryResponse.model_validate(d) for d in deliveries]
