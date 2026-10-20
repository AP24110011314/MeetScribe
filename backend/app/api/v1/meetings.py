"""Meeting endpoints (docs/API.md). Thin: logic lives in `app.services.meetings`."""

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession, Storage
from app.api.v1.meetings_deps import OwnedMeeting
from app.db.enums import MeetingStatus
from app.schemas.meetings import (
    CreateMeetingRequest,
    CreateMeetingResponse,
    MeetingListItem,
    MeetingStatusResponse,
    PaginatedMeetings,
)
from app.services import meetings as meetings_service
from app.services.storage import PRESIGN_EXPIRES_SEC

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreateMeetingResponse)
async def create_meeting(
    payload: CreateMeetingRequest,
    current_user: CurrentUser,
    session: DbSession,
    storage: Storage,
) -> CreateMeetingResponse:
    meeting, upload_url = await meetings_service.create_meeting(
        session,
        storage,
        current_user,
        filename=payload.filename,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
    )
    return CreateMeetingResponse(
        meeting_id=meeting.id,
        upload_url=upload_url,
        upload_headers={"Content-Type": payload.content_type},
        expires_in=PRESIGN_EXPIRES_SEC,
    )


@router.post("/{meeting_id}/complete", response_model=MeetingListItem)
async def complete_meeting(
    meeting: OwnedMeeting,
    session: DbSession,
    storage: Storage,
) -> MeetingListItem:
    updated = await meetings_service.complete_upload(session, storage, meeting)
    return MeetingListItem.model_validate(updated)


@router.get("/{meeting_id}/status", response_model=MeetingStatusResponse)
async def get_meeting_status(
    meeting: OwnedMeeting,
    session: DbSession,
) -> MeetingStatusResponse:
    status, stage, progress = await meetings_service.get_meeting_status(session, meeting)
    return MeetingStatusResponse(
        status=status,
        stage=stage,
        progress_pct=progress,
        error_message=meeting.error_message,
    )


@router.get("", response_model=PaginatedMeetings)
async def list_meetings(
    current_user: CurrentUser,
    session: DbSession,
    q: str | None = None,
    status_filter: MeetingStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedMeetings:
    meetings, total = await meetings_service.list_meetings(
        session,
        current_user,
        q=q,
        status=status_filter,
        page=page,
        page_size=page_size,
    )
    return PaginatedMeetings(
        items=[MeetingListItem.model_validate(m) for m in meetings],
        page=page,
        page_size=page_size,
        total=total,
    )
