import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import Folder, Meeting, User
from app.db.session import get_db
from app.schemas.organization import (
    FolderCreateRequest,
    FolderListResponse,
    FolderResponse,
    FolderUpdateRequest,
)

router = APIRouter(prefix="/folders", tags=["Folders"])


@router.get("", response_model=FolderListResponse, summary="List user folders with meeting counts")
async def list_folders(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FolderListResponse:
    # Query folders and count active (non-deleted) meetings
    stmt = (
        select(Folder, func.count(Meeting.id).label("meeting_count"))
        .outerjoin(Meeting, (Folder.id == Meeting.folder_id) & (Meeting.deleted_at.is_(None)))
        .where(Folder.user_id == current_user.id)
        .group_by(Folder.id)
        .order_by(Folder.created_at.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = [
        FolderResponse(
            id=folder.id,
            name=folder.name,
            color=folder.color,
            meeting_count=count,
            created_at=folder.created_at,
        )
        for folder, count in rows
    ]
    return FolderListResponse(items=items)


@router.post(
    "",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new folder",
)
async def create_folder(
    data: FolderCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FolderResponse:
    folder = Folder(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=data.name,
        color=data.color,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)

    return FolderResponse(
        id=folder.id,
        name=folder.name,
        color=folder.color,
        meeting_count=0,
        created_at=folder.created_at,
    )


@router.patch("/{folder_id}", response_model=FolderResponse, summary="Update folder name or color")
async def update_folder(
    folder_id: uuid.UUID,
    data: FolderUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FolderResponse:
    stmt = select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    result = await db.execute(stmt)
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    if data.name is not None:
        folder.name = data.name
    if data.color is not None:
        folder.color = data.color

    await db.commit()
    await db.refresh(folder)

    # Get meeting count
    count_stmt = select(func.count(Meeting.id)).where(
        Meeting.folder_id == folder.id, Meeting.deleted_at.is_(None)
    )
    count_res = await db.execute(count_stmt)
    count = count_res.scalar_one()

    return FolderResponse(
        id=folder.id,
        name=folder.name,
        color=folder.color,
        meeting_count=count,
        created_at=folder.created_at,
    )


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a folder")
async def delete_folder(
    folder_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    stmt = select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    result = await db.execute(stmt)
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    await db.delete(folder)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
