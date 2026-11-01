import uuid
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_owned_meeting
from app.db.models import Meeting, Tag, User, meeting_tags
from app.db.session import get_db
from app.schemas.organization import MeetingTagsUpdateRequest, TagCreateRequest, TagResponse

router = APIRouter(tags=["Tags"])


@router.get("/tags", response_model=List[TagResponse], summary="List all user tags")
async def list_tags(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[TagResponse]:
    stmt = select(Tag).where(Tag.user_id == current_user.id).order_by(Tag.name.asc())
    result = await db.execute(stmt)
    tags = result.scalars().all()
    return [TagResponse.model_validate(t) for t in tags]


@router.post(
    "/tags",
    response_model=TagResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new tag",
)
async def create_tag(
    data: TagCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TagResponse:
    # Check if duplicate name for user
    check_stmt = select(Tag).where(Tag.user_id == current_user.id, Tag.name == data.name)
    check_res = await db.execute(check_stmt)
    if check_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tag '{data.name}' already exists",
        )

    tag = Tag(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=data.name,
        color=data.color,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return TagResponse.model_validate(tag)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a tag")
async def delete_tag(
    tag_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    stmt = select(Tag).where(Tag.id == tag_id, Tag.user_id == current_user.id)
    result = await db.execute(stmt)
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    await db.delete(tag)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/meetings/{meeting_id}/tags",
    response_model=List[TagResponse],
    summary="Update tags assigned to a meeting",
)
async def update_meeting_tags(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    data: MeetingTagsUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[TagResponse]:
    # Validate that all tag_ids belong to current_user
    if data.tag_ids:
        tags_stmt = select(Tag).where(Tag.user_id == current_user.id, Tag.id.in_(data.tag_ids))
        tags_res = await db.execute(tags_stmt)
        valid_tags = tags_res.scalars().all()
        if len(valid_tags) != len(data.tag_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more specified tags do not exist or belong to another user",
            )
    else:
        valid_tags = []

    # Clear existing tags on meeting
    await db.execute(delete(meeting_tags).where(meeting_tags.c.meeting_id == meeting.id))

    # Insert new tags
    for tag in valid_tags:
        await db.execute(insert(meeting_tags).values(meeting_id=meeting.id, tag_id=tag.id))

    await db.commit()
    return [TagResponse.model_validate(t) for t in valid_tags]
