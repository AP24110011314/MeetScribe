import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.db.models import Meeting, User
from app.db.session import get_db
from app.schemas.ai_features import (
    ChatHistoryResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    FollowUpEmailRequest,
    FollowUpEmailResponse,
    GlobalChatRequest,
    GlobalChatResponse,
    MeetingChaptersResponse,
    MeetingInsightsResponse,
    RegenerateRequest,
    TranslatedNotesResponse,
    TranslateRequest,
)
from app.schemas.meeting import MeetingDetailResponse
from app.services.ai_features import AIFeaturesService

ai_router = APIRouter(tags=["AI Features"])


async def get_loaded_meeting(
    meeting_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> Meeting:
    result = await db.execute(
        select(Meeting)
        .options(
            selectinload(Meeting.summary),
            selectinload(Meeting.transcript),
            selectinload(Meeting.action_items),
            selectinload(Meeting.tags),
        )
        .where(
            Meeting.id == meeting_id,
            Meeting.user_id == user_id,
            Meeting.deleted_at.is_(None),
        )
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    return meeting


@ai_router.post("/meetings/{meeting_id}/chat")
@limiter.limit("30/minute")
async def chat_with_meeting(
    request: Request,
    meeting_id: uuid.UUID,
    chat_req: ChatMessageRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    meeting = await get_loaded_meeting(meeting_id, current_user.id, db)
    service = AIFeaturesService(db)
    user_text = chat_req.text

    return StreamingResponse(
        service.chat_with_meeting_stream(meeting, current_user.id, user_text),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@ai_router.get("/meetings/{meeting_id}/chat/history", response_model=ChatHistoryResponse)
async def get_meeting_chat_history(
    meeting_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatHistoryResponse:
    await get_loaded_meeting(meeting_id, current_user.id, db)
    service = AIFeaturesService(db)
    chats = await service.get_chat_history(meeting_id, current_user.id)
    return ChatHistoryResponse(
        meeting_id=meeting_id,
        messages=[
            ChatMessageResponse(
                id=c.id,
                role=c.role,
                content=c.content,
                citations=c.citations or [],
                created_at=c.created_at,
            )
            for c in chats
        ],
    )


@ai_router.post("/chat/global", response_model=GlobalChatResponse)
@limiter.limit("20/minute")
async def global_chat(
    request: Request,
    req: GlobalChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GlobalChatResponse:
    service = AIFeaturesService(db)
    return await service.global_chat(current_user.id, req.query)


@ai_router.post("/meetings/{meeting_id}/regenerate", response_model=MeetingDetailResponse)
@limiter.limit("10/minute")
async def regenerate_notes_with_template(
    request: Request,
    meeting_id: uuid.UUID,
    req: RegenerateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingDetailResponse:
    meeting = await get_loaded_meeting(meeting_id, current_user.id, db)
    service = AIFeaturesService(db)
    try:
        await service.regenerate_with_template(meeting, req.template)
        # Reload fully
        return await get_loaded_meeting(meeting_id, current_user.id, db)  # type: ignore[return-value]
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@ai_router.get("/meetings/{meeting_id}/chapters", response_model=MeetingChaptersResponse)
async def get_meeting_chapters(
    meeting_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingChaptersResponse:
    meeting = await get_loaded_meeting(meeting_id, current_user.id, db)
    service = AIFeaturesService(db)
    return await service.get_chapters(meeting)


@ai_router.post("/meetings/{meeting_id}/email", response_model=FollowUpEmailResponse)
@limiter.limit("20/minute")
async def generate_followup_email(
    request: Request,
    meeting_id: uuid.UUID,
    req: FollowUpEmailRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FollowUpEmailResponse:
    meeting = await get_loaded_meeting(meeting_id, current_user.id, db)
    service = AIFeaturesService(db)
    return await service.generate_followup_email(meeting, req)


@ai_router.post("/meetings/{meeting_id}/translate", response_model=TranslatedNotesResponse)
@limiter.limit("20/minute")
async def translate_meeting_notes(
    request: Request,
    meeting_id: uuid.UUID,
    req: TranslateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TranslatedNotesResponse:
    meeting = await get_loaded_meeting(meeting_id, current_user.id, db)
    service = AIFeaturesService(db)
    return await service.translate_notes(meeting, req)


@ai_router.get("/meetings/{meeting_id}/insights", response_model=MeetingInsightsResponse)
async def get_meeting_insights(
    meeting_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingInsightsResponse:
    meeting = await get_loaded_meeting(meeting_id, current_user.id, db)
    service = AIFeaturesService(db)
    return await service.get_insights(meeting)
