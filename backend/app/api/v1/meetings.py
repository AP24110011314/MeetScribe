"""Meeting endpoints (docs/API.md). Thin: logic lives in `app.services.meetings`."""

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, Storage
from app.api.v1.meetings_deps import OwnedMeeting
from app.core.errors import APIError
from app.db.enums import MeetingStatus
from app.db.models import ActionItem, Meeting
from app.schemas.meetings import (
    ActionItemResponse,
    AudioUrlResponse,
    CreateActionItemRequest,
    CreateMeetingRequest,
    CreateMeetingResponse,
    MeetingDetail,
    MeetingListItem,
    MeetingStatusResponse,
    PaginatedMeetings,
    SummaryResponse,
    TranscriptResponse,
    UpdateActionItemRequest,
    UpdateMeetingRequest,
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


@router.get("/{meeting_id}", response_model=MeetingDetail)
async def get_meeting_detail(
    meeting: OwnedMeeting,
    session: DbSession,
) -> MeetingDetail:
    (
        meeting_obj,
        transcript_row,
        summary_row,
        action_items,
    ) = await meetings_service.get_meeting_detail_full(session, meeting)
    transcript_resp = None
    if transcript_row is not None:
        segs = [{"start": 0.0, "end": 0.0, "text": ""}]
        transcript_resp = TranscriptResponse.model_validate(
            {"full_text": transcript_row.full_text, "model": transcript_row.model, "segments": segs}
        )
    summary_resp = None
    if summary_row is not None:
        summary_resp = SummaryResponse(
            summary=summary_row.summary,
            key_points=summary_row.key_points or [],
            decisions=summary_row.decisions or [],
        )
    return MeetingDetail(
        id=meeting_obj.id,
        title=meeting_obj.title,
        original_filename=meeting_obj.original_filename,
        status=meeting_obj.status,
        duration_sec=meeting_obj.duration_sec,
        language=meeting_obj.language,
        created_at=meeting_obj.created_at,
        error_message=meeting_obj.error_message,
        transcript=transcript_resp,
        summary=summary_resp,
        action_items=[ActionItemResponse.model_validate(a) for a in action_items],
    )


@router.get("/{meeting_id}/transcript", response_model=TranscriptResponse)
async def get_transcript(
    meeting: OwnedMeeting,
    session: DbSession,
) -> TranscriptResponse:
    result = await meetings_service.get_transcript_response(session, meeting)
    return (
        TranscriptResponse.model_validate(result)
        if not isinstance(result, TranscriptResponse)
        else result
    )


@router.get("/{meeting_id}/audio-url", response_model=AudioUrlResponse)
async def get_audio_url(
    meeting: OwnedMeeting,
    storage: Storage,
) -> AudioUrlResponse:
    url, expires_in = await meetings_service.get_audio_url(storage, meeting)
    return AudioUrlResponse(url=url, expires_in=expires_in)


@router.post("/{meeting_id}/retry", response_model=MeetingListItem)
async def retry_meeting(
    meeting: OwnedMeeting,
    session: DbSession,
) -> MeetingListItem:
    updated = await meetings_service.retry_meeting(session, meeting)
    return MeetingListItem.model_validate(updated)


@router.patch("/{meeting_id}", response_model=MeetingListItem)
async def update_meeting(
    meeting: OwnedMeeting,
    payload: UpdateMeetingRequest,
    session: DbSession,
) -> MeetingListItem:
    updated = await meetings_service.update_meeting_title(session, meeting, payload.title)
    return MeetingListItem.model_validate(updated)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    meeting: OwnedMeeting,
    session: DbSession,
    storage: Storage,
) -> Response:
    await meetings_service.delete_meeting(session, storage, meeting)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{meeting_id}/action-items",
    response_model=ActionItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_action_item(
    meeting: OwnedMeeting,
    payload: CreateActionItemRequest,
    session: DbSession,
) -> ActionItemResponse:
    item = await meetings_service.create_action_item(
        session,
        meeting,
        description=payload.description,
        owner=payload.owner,
        due_date=payload.due_date,
        priority=payload.priority,
    )
    return ActionItemResponse.model_validate(item)


@router.get("/action-items", response_model=list[ActionItemResponse])
async def list_all_action_items(
    current_user: CurrentUser,
    session: DbSession,
    status_filter: str | None = None,
    meeting_id: str | None = None,
    owner: str | None = None,
) -> list[ActionItemResponse]:

    items_with_meetings = await meetings_service.list_all_action_items(
        session,
        current_user,
        status=status_filter,
        meeting_id=meeting_id,
        owner=owner,
    )
    items = [row[0] for row in items_with_meetings]
    return [ActionItemResponse.model_validate(i) for i in items]


@router.patch("/action-items/{action_item_id}", response_model=ActionItemResponse)
async def update_action_item(
    action_item_id: str,
    payload: UpdateActionItemRequest,
    session: DbSession,
    current_user: CurrentUser,
) -> ActionItemResponse:

    stmt = (
        select(ActionItem)
        .join(Meeting, ActionItem.meeting_id == Meeting.id)
        .where(ActionItem.id == action_item_id, Meeting.user_id == current_user.id)
    )
    result = await session.execute(stmt)
    item = result.scalar_one_or_none()
    if item is None:
        raise APIError(404, "Action item not found", "ACTION_ITEM_NOT_FOUND")
    updates = payload.model_dump(exclude_unset=True)
    updated = await meetings_service.update_action_item(session, item, **updates)
    return ActionItemResponse.model_validate(updated)


@router.delete("/action-items/{action_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_action_item(
    action_item_id: str,
    session: DbSession,
    current_user: CurrentUser,
) -> Response:

    stmt = (
        select(ActionItem)
        .join(Meeting, ActionItem.meeting_id == Meeting.id)
        .where(ActionItem.id == action_item_id, Meeting.user_id == current_user.id)
    )
    result = await session.execute(stmt)
    item = result.scalar_one_or_none()
    if item is None:
        raise APIError(404, "Action item not found", "ACTION_ITEM_NOT_FOUND")
    await meetings_service.delete_action_item(session, item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{meeting_id}/export")
async def export_meeting(
    meeting: OwnedMeeting,
    session: DbSession,
    format: str = Query("md"),
) -> Response:
    from fastapi import Response

    from app.services import export as export_service

    (
        meeting_obj,
        transcript_row,
        summary_row,
        action_items,
    ) = await meetings_service.get_meeting_detail_full(session, meeting)
    if format == "pdf":
        content = export_service.render_pdf(meeting_obj, summary_row, action_items, transcript_row)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{meeting_obj.id}.pdf"'},
        )
    content_md = export_service.render_markdown(
        meeting_obj, summary_row, action_items, transcript_row
    )
    return Response(
        content=content_md.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{meeting_obj.id}.md"'},
    )
