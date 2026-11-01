import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import Meeting, User
from app.db.session import get_db
from app.schemas.organization import TrashItemResponse, TrashListResponse
from app.services.storage import get_storage_service

router = APIRouter(prefix="/trash", tags=["Trash"])


@router.get("", response_model=TrashListResponse, summary="List meetings currently in trash")
async def list_trash(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TrashListResponse:
    stmt = (
        select(Meeting)
        .where(Meeting.user_id == current_user.id, Meeting.deleted_at.isnot(None))
        .order_by(Meeting.deleted_at.desc())
    )
    result = await db.execute(stmt)
    meetings = result.scalars().all()

    now = datetime.now(timezone.utc)
    items = []
    for m in meetings:
        deleted = m.deleted_at or now
        days_passed = (now - deleted).days
        days_left = max(0, 30 - days_passed)
        items.append(
            TrashItemResponse(
                id=m.id,
                title=m.title,
                duration_sec=m.duration_sec,
                created_at=m.created_at,
                deleted_at=deleted,
                days_until_purge=days_left,
            )
        )
    return TrashListResponse(items=items, total=len(items))


@router.post("/{meeting_id}/restore", summary="Restore a meeting from trash")
async def restore_meeting(
    meeting_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    stmt = select(Meeting).where(
        Meeting.id == meeting_id,
        Meeting.user_id == current_user.id,
        Meeting.deleted_at.isnot(None),
    )
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found in trash",
        )

    meeting.deleted_at = None
    meeting.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"status": "restored", "id": str(meeting.id)}


@router.delete(
    "/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Permanently delete a meeting"
)
async def permanent_delete_meeting(
    meeting_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    stmt = select(Meeting).where(
        Meeting.id == meeting_id,
        Meeting.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    storage = get_storage_service()
    prefix = f"uploads/{current_user.id}/{meeting.id}/"
    try:
        storage.delete(prefix)
    except Exception:
        pass
    if meeting.audio_key:
        try:
            storage.delete(meeting.audio_key)
        except Exception:
            pass
    if meeting.normalized_key:
        try:
            storage.delete(meeting.normalized_key)
        except Exception:
            pass

    await db.delete(meeting)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/empty/all", summary="Empty all meetings in user's trash")
async def empty_trash(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, int]:
    stmt = select(Meeting).where(
        Meeting.user_id == current_user.id,
        Meeting.deleted_at.isnot(None),
    )
    result = await db.execute(stmt)
    meetings = result.scalars().all()

    storage = get_storage_service()
    deleted_count = len(meetings)
    for m in meetings:
        prefix = f"uploads/{current_user.id}/{m.id}/"
        try:
            storage.delete(prefix)
        except Exception:
            pass
        if m.audio_key:
            try:
                storage.delete(m.audio_key)
            except Exception:
                pass
        if m.normalized_key:
            try:
                storage.delete(m.normalized_key)
            except Exception:
                pass
        await db.delete(m)

    await db.commit()
    return {"deleted_count": deleted_count}
