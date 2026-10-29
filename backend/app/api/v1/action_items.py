import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_owned_action_item
from app.db.models import ActionItem, Meeting, User
from app.db.session import get_db
from app.schemas.meeting import (
    ActionItemListResponse,
    ActionItemResponse,
    ActionItemUpdateRequest,
)

router = APIRouter(prefix="/action-items", tags=["Action Items"])


@router.get(
    "",
    response_model=ActionItemListResponse,
    summary="List action items across meetings with filters and pagination",
)
async def list_action_items(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Optional[str] = Query(None, alias="status"),
    meeting_id: Optional[uuid.UUID] = Query(None),
    owner: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    due_before: Optional[date] = Query(None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ActionItemListResponse:
    # Build query joining Meeting to verify ownership
    base_query = (
        select(ActionItem, Meeting.title.label("meeting_title"))
        .join(Meeting, ActionItem.meeting_id == Meeting.id)
        .where(Meeting.user_id == current_user.id)
    )

    if status_filter:
        base_query = base_query.where(ActionItem.status == status_filter)
    if meeting_id:
        base_query = base_query.where(ActionItem.meeting_id == meeting_id)
    if owner:
        base_query = base_query.where(ActionItem.owner.ilike(f"%{owner}%"))
    if priority:
        base_query = base_query.where(ActionItem.priority == priority)
    if due_before:
        base_query = base_query.where(ActionItem.due_date <= due_before)

    # Count total matching items
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply order and pagination
    offset = (page - 1) * page_size
    query = (
        base_query.order_by(
            ActionItem.due_date.asc().nulls_last(),
            ActionItem.created_at.desc(),
        )
        .offset(offset)
        .limit(page_size)
    )

    result = await db.execute(query)
    rows = result.all()

    items = []
    for item, m_title in rows:
        item_dict = {
            "id": item.id,
            "meeting_id": item.meeting_id,
            "meeting_title": m_title,
            "description": item.description,
            "owner": item.owner,
            "due_date": item.due_date,
            "priority": item.priority,
            "status": item.status,
            "source_start_sec": item.source_start_sec,
            "created_by_ai": item.created_by_ai,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        items.append(ActionItemResponse.model_validate(item_dict))

    return ActionItemListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch(
    "/{item_id}",
    response_model=ActionItemResponse,
    summary="Update action item fields",
)
async def update_action_item(
    item: Annotated[ActionItem, Depends(get_owned_action_item)],
    data: ActionItemUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActionItemResponse:
    if data.description is not None:
        item.description = data.description
    if data.owner is not None:
        item.owner = data.owner
    if data.due_date is not None:
        item.due_date = data.due_date
    if data.priority is not None:
        item.priority = data.priority
    if data.status is not None:
        item.status = data.status

    item.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)

    # Fetch meeting title for response
    meeting = await db.get(Meeting, item.meeting_id)
    meeting_title = meeting.title if meeting else None

    item_dict = {
        "id": item.id,
        "meeting_id": item.meeting_id,
        "meeting_title": meeting_title,
        "description": item.description,
        "owner": item.owner,
        "due_date": item.due_date,
        "priority": item.priority,
        "status": item.status,
        "source_start_sec": item.source_start_sec,
        "created_by_ai": item.created_by_ai,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }
    return ActionItemResponse.model_validate(item_dict)


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete action item",
)
async def delete_action_item(
    item: Annotated[ActionItem, Depends(get_owned_action_item)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await db.delete(item)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
