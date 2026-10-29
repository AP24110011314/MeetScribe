import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_owned_meeting
from app.core.config import settings
from app.db.models import ActionItem, Meeting, Transcript, User
from app.db.session import get_db
from app.schemas.meeting import (
    ActionItemCreateRequest,
    ActionItemResponse,
    AudioUrlResponse,
    MeetingCreateRequest,
    MeetingDetailResponse,
    MeetingListItem,
    MeetingListResponse,
    MeetingStatusResponse,
    MeetingUpdateRequest,
    MeetingUploadResponse,
    SummaryResponse,
    TranscriptResponse,
    TranscriptSegment,
)
from app.services.export import export_markdown, export_pdf
from app.services.storage import get_storage_service

router = APIRouter(prefix="/meetings", tags=["Meetings"])

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg"}
ALLOWED_MIME_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/m4a",
    "audio/x-m4a",
    "audio/mp4",
    "video/mp4",
    "audio/webm",
    "video/webm",
    "audio/ogg",
    "video/ogg",
    "application/ogg",
}


@router.post(
    "",
    response_model=MeetingUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Initiate meeting upload and get presigned PUT URL",
)
async def create_meeting(
    data: MeetingCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingUploadResponse:
    # 1. Validate file extension and MIME type
    ext = Path(data.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS and data.content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type '{ext or data.content_type}'. Allowed formats: mp3, wav, m4a, mp4, webm, ogg",
        )

    # 2. Validate file size (up to MAX_UPLOAD_MB)
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if data.size_bytes <= 0 or data.size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File size must be between 1 byte and {settings.MAX_UPLOAD_MB} MB",
        )

    # 3. Create meeting row with status 'pending_upload'
    meeting_id = uuid.uuid4()
    clean_ext = ext.lstrip(".") if ext else "mp3"
    audio_key = f"uploads/{current_user.id}/{meeting_id}/original.{clean_ext}"

    title = Path(data.filename).stem or "Untitled Meeting"

    meeting = Meeting(
        id=meeting_id,
        user_id=current_user.id,
        title=title,
        title_edited=False,
        original_filename=data.filename,
        content_type=data.content_type,
        size_bytes=data.size_bytes,
        audio_key=audio_key,
        status="pending_upload",
        progress_pct=0.0,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)

    # 4. Generate presigned upload URL
    storage = get_storage_service()
    expires_in = 900  # 15 minutes
    upload_url, headers = storage.presign_upload(
        key=audio_key,
        content_type=data.content_type,
        max_size_bytes=data.size_bytes,
        expires_in=expires_in,
    )

    return MeetingUploadResponse(
        meeting_id=meeting.id,
        upload_url=upload_url,
        upload_method="PUT",
        upload_headers=headers,
        expires_in=expires_in,
        storage_backend=settings.STORAGE_BACKEND,
    )


@router.get(
    "",
    response_model=MeetingListResponse,
    summary="List meetings with search, filter, sort, and pagination",
)
async def list_meetings(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search term across title and transcript"),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort: str = Query("created_at", pattern="^(created_at|title|duration|duration_sec)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> MeetingListResponse:
    # Outer join Transcript so we can search both title and transcript text
    conditions = [Meeting.user_id == current_user.id]

    if status_filter:
        conditions.append(Meeting.status == status_filter)

    if q:
        clean_q = q.strip()
        search_filter = or_(
            Meeting.title.ilike(f"%{clean_q}%"),
            Transcript.full_text.ilike(f"%{clean_q}%"),
            Transcript.search_vector.op("@@")(func.websearch_to_tsquery("english", clean_q)),
        )
        conditions.append(search_filter)

    # Count distinct meetings
    count_query = (
        select(func.count(distinct(Meeting.id)))
        .outerjoin(Transcript, Meeting.id == Transcript.meeting_id)
        .where(*conditions)
    )
    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    # Determine sort expression
    order_expr: Any
    if sort == "title":
        order_expr = Meeting.title.asc() if order == "asc" else Meeting.title.desc()
    elif sort in ("duration", "duration_sec"):
        order_expr = Meeting.duration_sec.asc() if order == "asc" else Meeting.duration_sec.desc()
    else:
        order_expr = Meeting.created_at.asc() if order == "asc" else Meeting.created_at.desc()

    offset = (page - 1) * page_size
    meetings_query = (
        select(Meeting)
        .outerjoin(Transcript, Meeting.id == Transcript.meeting_id)
        .where(*conditions)
        .group_by(Meeting.id)
        .order_by(order_expr)
        .offset(offset)
        .limit(page_size)
        .options(selectinload(Meeting.transcript), selectinload(Meeting.action_items))
    )

    result = await db.execute(meetings_query)
    meetings = result.scalars().all()

    items = []
    for m in meetings:
        items.append(
            MeetingListItem(
                id=m.id,
                title=m.title,
                status=m.status,
                duration_sec=m.duration_sec,
                created_at=m.created_at,
                has_transcript=m.transcript is not None,
                action_items_count=len(m.action_items),
            )
        )

    return MeetingListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/{meeting_id}/complete",
    response_model=MeetingStatusResponse,
    summary="Signal that audio upload to storage is complete and enqueue pipeline",
)
async def complete_meeting_upload(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingStatusResponse:
    # 1. Verify meeting is in pending_upload status
    if meeting.status != "pending_upload":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Meeting is already in status '{meeting.status}'",
        )

    # 2. Verify file exists in storage backend
    if not meeting.audio_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Meeting audio key is missing",
        )

    storage = get_storage_service()
    if not storage.exists(meeting.audio_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file not found in storage",
        )

    # 3. Transition to 'queued'
    meeting.status = "queued"
    meeting.progress_pct = 5.0
    await db.commit()
    await db.refresh(meeting)

    # 4. Enqueue background processing pipeline
    from app.workers.tasks import process_meeting

    process_meeting.delay(str(meeting.id))

    return MeetingStatusResponse(
        meeting_id=meeting.id,
        status=meeting.status,
        stage=meeting.stage,
        progress_pct=meeting.progress_pct,
        error_message=meeting.error_message,
        process_attempts=meeting.process_attempts,
    )


@router.get(
    "/{meeting_id}/status",
    response_model=MeetingStatusResponse,
    summary="Get meeting processing status and progress",
)
async def get_meeting_status(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
) -> MeetingStatusResponse:
    return MeetingStatusResponse(
        meeting_id=meeting.id,
        status=meeting.status,
        stage=meeting.stage,
        progress_pct=meeting.progress_pct,
        error_message=meeting.error_message,
        process_attempts=meeting.process_attempts,
    )


@router.get(
    "/{meeting_id}",
    response_model=MeetingDetailResponse,
    summary="Get meeting detail with summary, action items, and metadata",
)
async def get_meeting_detail(
    meeting_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingDetailResponse:
    stmt = (
        select(Meeting)
        .where(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
        .options(
            selectinload(Meeting.transcript),
            selectinload(Meeting.summary),
            selectinload(Meeting.action_items),
        )
    )
    res = await db.execute(stmt)
    meeting = res.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    summary_data = None
    if meeting.summary:
        summary_data = SummaryResponse(
            summary=meeting.summary.summary,
            key_points=meeting.summary.key_points,
            decisions=meeting.summary.decisions,
        )

    action_items_data = [
        ActionItemResponse(
            id=item.id,
            meeting_id=item.meeting_id,
            meeting_title=meeting.title,
            description=item.description,
            owner=item.owner,
            due_date=item.due_date,
            priority=item.priority,
            status=item.status,
            source_start_sec=item.source_start_sec,
            created_by_ai=item.created_by_ai,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in meeting.action_items
    ]

    return MeetingDetailResponse(
        id=meeting.id,
        title=meeting.title,
        title_edited=meeting.title_edited,
        status=meeting.status,
        stage=meeting.stage,
        progress_pct=meeting.progress_pct,
        error_message=meeting.error_message,
        duration_sec=meeting.duration_sec,
        language=meeting.language,
        has_transcript=meeting.transcript is not None,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        summary=summary_data,
        action_items=action_items_data,
    )


@router.get(
    "/{meeting_id}/transcript",
    response_model=TranscriptResponse,
    summary="Get meeting transcript segments with optional search",
)
async def get_meeting_transcript(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search term within transcript segments"),
) -> TranscriptResponse:
    stmt = select(Transcript).where(Transcript.meeting_id == meeting.id)
    res = await db.execute(stmt)
    transcript = res.scalar_one_or_none()

    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcript not found for this meeting",
        )

    segments_data = [
        TranscriptSegment(
            id=s["id"],
            start=s["start"],
            end=s["end"],
            text=s["text"],
        )
        for s in transcript.segments
    ]

    matching_ids = None
    if q:
        clean_q = q.lower().strip()
        matching_ids = [s.id for s in segments_data if clean_q in s.text.lower()]

    return TranscriptResponse(
        language=meeting.language or "en",
        full_text=transcript.full_text,
        segments=segments_data,
        matching_segment_ids=matching_ids,
    )


@router.get(
    "/{meeting_id}/audio-url",
    response_model=AudioUrlResponse,
    summary="Get presigned audio playback URL with Range request support",
)
async def get_audio_playback_url(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
) -> AudioUrlResponse:
    target_key = meeting.normalized_key or meeting.audio_key
    if not target_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio file has not been uploaded yet",
        )

    storage = get_storage_service()
    if not storage.exists(target_key):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio file not found in storage",
        )

    expires_in = 900
    url = storage.presign_download(target_key, expires_in=expires_in)
    return AudioUrlResponse(url=url, expires_in=expires_in)


@router.patch(
    "/{meeting_id}",
    response_model=MeetingDetailResponse,
    summary="Update meeting title",
)
async def update_meeting(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    data: MeetingUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingDetailResponse:
    meeting.title = data.title.strip()
    meeting.title_edited = True
    meeting.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(meeting)

    return await get_meeting_detail(meeting.id, meeting.user, db)


@router.delete(
    "/{meeting_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete meeting and clean up storage",
)
async def delete_meeting(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    storage = get_storage_service()

    # Clean up storage prefix and individual keys
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

    # Database cascade delete removes transcripts, summaries, action_items, jobs
    await db.delete(meeting)
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{meeting_id}/retry",
    response_model=MeetingStatusResponse,
    summary="Retry failed meeting",
)
async def retry_meeting(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingStatusResponse:
    if meeting.status != "failed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot retry meeting in status '{meeting.status}'. Only failed meetings can be retried.",
        )

    meeting.status = "queued"
    meeting.stage = None
    meeting.progress_pct = 5.0
    meeting.error_message = None
    meeting.process_attempts = 0
    meeting.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(meeting)

    from app.workers.tasks import process_meeting

    process_meeting.delay(str(meeting.id))

    return MeetingStatusResponse(
        meeting_id=meeting.id,
        status=meeting.status,
        stage=meeting.stage,
        progress_pct=meeting.progress_pct,
        error_message=meeting.error_message,
        process_attempts=meeting.process_attempts,
    )


@router.get(
    "/{meeting_id}/export",
    summary="Export notes in Markdown or PDF format",
)
async def export_meeting_notes(
    meeting_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    format: str = Query("md", pattern="^(md|pdf)$"),
) -> Response:
    stmt = (
        select(Meeting)
        .where(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
        .options(
            selectinload(Meeting.summary),
            selectinload(Meeting.action_items),
        )
    )
    res = await db.execute(stmt)
    meeting = res.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    if meeting.status != "done":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot export notes for meeting in status '{meeting.status}'. Meeting must be 'done'.",
        )

    safe_title = re.sub(r"[^a-zA-Z0-9_-]", "_", meeting.title).strip("_") or "meeting_notes"

    if format == "md":
        content = export_markdown(meeting, meeting.summary, meeting.action_items)
        return Response(
            content=content,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.md"'},
        )
    else:
        pdf_bytes = export_pdf(meeting, meeting.summary, meeting.action_items)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.pdf"'},
        )


@router.post(
    "/{meeting_id}/action-items",
    response_model=ActionItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a manual action item for this meeting",
)
async def create_meeting_action_item(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    data: ActionItemCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActionItemResponse:
    item = ActionItem(
        id=uuid.uuid4(),
        meeting_id=meeting.id,
        user_id=current_user.id,
        description=data.description.strip(),
        owner=data.owner.strip() if data.owner else None,
        due_date=data.due_date,
        priority=data.priority,
        status=data.status,
        created_by_ai=False,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    item_dict = {
        "id": item.id,
        "meeting_id": item.meeting_id,
        "meeting_title": meeting.title,
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
