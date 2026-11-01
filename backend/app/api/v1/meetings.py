import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import distinct, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import get_current_user, get_owned_meeting
from app.core.config import settings
from app.db.models import (
    ActionItem,
    Folder,
    Meeting,
    MeetingBookmark,
    Transcript,
    User,
    meeting_tags,
)
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
from app.schemas.organization import (
    BookmarkCreateRequest,
    BookmarkResponse,
    MeetingBulkRequest,
    MeetingBulkResponse,
    MeetingOrganizeRequest,
    MeetingPasteRequest,
    SegmentEditRequest,
    TagResponse,
)
from app.services.export import (
    export_docx,
    export_ics,
    export_json,
    export_markdown,
    export_pdf,
    export_srt,
    export_txt,
    export_vtt,
)
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
    folder_id: Optional[uuid.UUID] = Query(None, description="Filter by folder ID"),
    tag_id: Optional[uuid.UUID] = Query(None, description="Filter by tag ID"),
    is_starred: Optional[bool] = Query(None, description="Filter starred meetings"),
    sort: str = Query("created_at", pattern="^(created_at|title|duration|duration_sec)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
) -> MeetingListResponse:
    # Outer join Transcript so we can search both title and transcript text
    conditions = [
        Meeting.user_id == current_user.id,
        Meeting.deleted_at.is_(None),
    ]

    if status_filter:
        conditions.append(Meeting.status == status_filter)

    if folder_id is not None:
        conditions.append(Meeting.folder_id == folder_id)

    if is_starred is not None:
        conditions.append(Meeting.is_starred == is_starred)

    if tag_id is not None:
        conditions.append(
            Meeting.id.in_(select(meeting_tags.c.meeting_id).where(meeting_tags.c.tag_id == tag_id))
        )

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
        .order_by(Meeting.is_pinned.desc(), order_expr)
        .offset(offset)
        .limit(page_size)
        .options(
            selectinload(Meeting.transcript),
            selectinload(Meeting.action_items),
            selectinload(Meeting.tags),
        )
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
                folder_id=m.folder_id,
                is_starred=m.is_starred,
                is_pinned=m.is_pinned,
                tags=[TagResponse.model_validate(t) for t in m.tags],
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
        .where(
            Meeting.id == meeting_id,
            Meeting.user_id == current_user.id,
            Meeting.deleted_at.is_(None),
        )
        .options(
            selectinload(Meeting.transcript),
            selectinload(Meeting.summary),
            selectinload(Meeting.action_items),
            selectinload(Meeting.tags),
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
        folder_id=meeting.folder_id,
        is_starred=meeting.is_starred,
        is_pinned=meeting.is_pinned,
        template=meeting.template,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        tags=[TagResponse.model_validate(t) for t in meeting.tags],
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
    summary="Delete meeting (soft-delete to trash by default, or permanent)",
)
async def delete_meeting(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    permanent: bool = Query(False, description="If true, permanently delete immediately"),
) -> Response:
    if permanent:
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

        # Database cascade delete removes transcripts, summaries, action_items, jobs
        await db.delete(meeting)
        await db.commit()
    else:
        meeting.deleted_at = datetime.now(timezone.utc)
        await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/{meeting_id}/organize",
    response_model=MeetingDetailResponse,
    summary="Organize meeting: update folder, star, or pin status",
)
async def organize_meeting(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    data: MeetingOrganizeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingDetailResponse:
    if data.folder_id is not None:
        if str(data.folder_id) == "00000000-0000-0000-0000-000000000000":
            meeting.folder_id = None
        else:
            f_stmt = select(Folder).where(
                Folder.id == data.folder_id, Folder.user_id == current_user.id
            )
            f_res = await db.execute(f_stmt)
            if not f_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
                )
            meeting.folder_id = data.folder_id

    if data.is_starred is not None:
        meeting.is_starred = data.is_starred
    if data.is_pinned is not None:
        meeting.is_pinned = data.is_pinned

    meeting.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(meeting)
    return await get_meeting_detail(meeting.id, current_user, db)


@router.post(
    "/bulk",
    response_model=MeetingBulkResponse,
    summary="Bulk actions across multiple meetings (star, unstar, pin, unpin, move, tag, trash, delete)",
)
async def bulk_meetings_action(
    data: MeetingBulkRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingBulkResponse:
    stmt = select(Meeting).where(
        Meeting.id.in_(data.meeting_ids), Meeting.user_id == current_user.id
    )
    res = await db.execute(stmt)
    meetings = res.scalars().all()
    affected = len(meetings)
    if not meetings:
        return MeetingBulkResponse(affected_count=0, action=data.action)

    undo_payload = {"action": data.action, "meeting_ids": [str(m.id) for m in meetings]}

    if data.action == "star":
        for m in meetings:
            m.is_starred = True
            m.updated_at = datetime.now(timezone.utc)
    elif data.action == "unstar":
        for m in meetings:
            m.is_starred = False
            m.updated_at = datetime.now(timezone.utc)
    elif data.action == "pin":
        for m in meetings:
            m.is_pinned = True
            m.updated_at = datetime.now(timezone.utc)
    elif data.action == "unpin":
        for m in meetings:
            m.is_pinned = False
            m.updated_at = datetime.now(timezone.utc)
    elif data.action == "move":
        if data.folder_id and str(data.folder_id) != "00000000-0000-0000-0000-000000000000":
            f_stmt = select(Folder).where(
                Folder.id == data.folder_id, Folder.user_id == current_user.id
            )
            f_res = await db.execute(f_stmt)
            if not f_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
                )
            target_folder_id = data.folder_id
        else:
            target_folder_id = None
        for m in meetings:
            m.folder_id = target_folder_id
            m.updated_at = datetime.now(timezone.utc)
    elif data.action == "tag":
        if data.tag_ids:
            for m in meetings:
                for tid in data.tag_ids:
                    t_check = await db.execute(
                        select(meeting_tags).where(
                            meeting_tags.c.meeting_id == m.id,
                            meeting_tags.c.tag_id == tid,
                        )
                    )
                    if not t_check.first():
                        await db.execute(insert(meeting_tags).values(meeting_id=m.id, tag_id=tid))
    elif data.action == "trash":
        for m in meetings:
            m.deleted_at = datetime.now(timezone.utc)
    elif data.action == "delete":
        storage = get_storage_service()
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
    return MeetingBulkResponse(
        affected_count=affected, action=data.action, undo_payload=undo_payload
    )


@router.patch(
    "/{meeting_id}/transcript/segment",
    response_model=TranscriptResponse,
    summary="Edit a transcript segment inline, preserving original text for revert",
)
async def edit_transcript_segment(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    data: SegmentEditRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TranscriptResponse:
    stmt = select(Transcript).where(Transcript.meeting_id == meeting.id)
    res = await db.execute(stmt)
    transcript = res.scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found")

    segments = list(transcript.segments)
    if data.segment_index < 0 or data.segment_index >= len(segments):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid segment index")

    seg = dict(segments[data.segment_index])
    if "original_text" not in seg:
        seg["original_text"] = seg.get("text", "")
    seg["text"] = data.text
    segments[data.segment_index] = seg

    transcript.segments = segments
    flag_modified(transcript, "segments")
    transcript.full_text = " ".join(s.get("text", "") for s in segments)
    transcript.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(transcript)

    return TranscriptResponse(
        language=meeting.language or "en",
        full_text=transcript.full_text,
        segments=[
            TranscriptSegment(
                id=s["id"],
                start=s["start"],
                end=s["end"],
                text=s["text"],
            )
            for s in transcript.segments
        ],
    )


@router.post(
    "/{meeting_id}/transcript/revert",
    response_model=TranscriptResponse,
    summary="Revert edited segments back to original Whisper transcript text",
)
async def revert_transcript(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TranscriptResponse:
    stmt = select(Transcript).where(Transcript.meeting_id == meeting.id)
    res = await db.execute(stmt)
    transcript = res.scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found")

    segments = list(transcript.segments)
    for i, seg in enumerate(segments):
        seg_dict = dict(seg)
        if "original_text" in seg_dict:
            seg_dict["text"] = seg_dict["original_text"]
            segments[i] = seg_dict

    transcript.segments = segments
    flag_modified(transcript, "segments")
    transcript.full_text = " ".join(s.get("text", "") for s in segments)
    transcript.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(transcript)

    return TranscriptResponse(
        language=meeting.language or "en",
        full_text=transcript.full_text,
        segments=[
            TranscriptSegment(
                id=s["id"],
                start=s["start"],
                end=s["end"],
                text=s["text"],
            )
            for s in transcript.segments
        ],
    )


@router.get(
    "/{meeting_id}/bookmarks",
    response_model=List[BookmarkResponse],
    summary="List timestamped bookmarks / personal notes for this meeting",
)
async def list_bookmarks(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[BookmarkResponse]:
    stmt = (
        select(MeetingBookmark)
        .where(MeetingBookmark.meeting_id == meeting.id)
        .order_by(MeetingBookmark.timestamp_sec.asc())
    )
    res = await db.execute(stmt)
    bms = res.scalars().all()
    return [BookmarkResponse.model_validate(b) for b in bms]


@router.post(
    "/{meeting_id}/bookmarks",
    response_model=BookmarkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a timestamped bookmark or note",
)
async def create_bookmark(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    data: BookmarkCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookmarkResponse:
    bm = MeetingBookmark(
        id=uuid.uuid4(),
        meeting_id=meeting.id,
        user_id=current_user.id,
        timestamp_sec=data.timestamp_sec,
        note=data.note,
    )
    db.add(bm)
    await db.commit()
    await db.refresh(bm)
    return BookmarkResponse.model_validate(bm)


@router.delete(
    "/{meeting_id}/bookmarks/{bookmark_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a bookmark",
)
async def delete_bookmark(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    bookmark_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    stmt = select(MeetingBookmark).where(
        MeetingBookmark.id == bookmark_id, MeetingBookmark.meeting_id == meeting.id
    )
    res = await db.execute(stmt)
    bm = res.scalar_one_or_none()
    if not bm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bookmark not found")
    await db.delete(bm)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/paste",
    response_model=MeetingDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create meeting from pasted raw transcript (skips audio, direct analysis)",
)
async def paste_transcript_meeting(
    data: MeetingPasteRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeetingDetailResponse:
    meeting_id = uuid.uuid4()
    meeting = Meeting(
        id=meeting_id,
        user_id=current_user.id,
        title=data.title,
        title_edited=True,
        is_pasted_transcript=True,
        status="queued",
        stage="analysis",
        progress_pct=10.0,
    )
    db.add(meeting)
    await db.flush()

    lines = [line.strip() for line in data.transcript_text.splitlines() if line.strip()]
    segments = []
    current_sec = 0.0
    for i, line in enumerate(lines):
        duration = max(3.0, len(line.split()) * 0.4)
        segments.append(
            {
                "id": i,
                "start": current_sec,
                "end": current_sec + duration,
                "text": line,
            }
        )
        current_sec += duration

    transcript = Transcript(
        meeting_id=meeting.id,
        full_text=data.transcript_text,
        segments=segments,
        model="pasted",
    )
    db.add(transcript)
    await db.commit()

    from app.workers.tasks import process_meeting

    process_meeting.delay(str(meeting.id))

    return await get_meeting_detail(meeting.id, current_user, db)


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
    summary="Export notes in md, pdf, docx, txt, json, srt, vtt, or ics format",
)
async def export_meeting_notes(
    meeting_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    format: str = Query("md", pattern="^(md|pdf|docx|txt|json|srt|vtt|ics)$"),
) -> Response:
    stmt = (
        select(Meeting)
        .where(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
        .options(
            selectinload(Meeting.summary),
            selectinload(Meeting.action_items),
            selectinload(Meeting.transcript),
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
        content = export_markdown(
            meeting, meeting.summary, meeting.action_items, meeting.transcript
        )
        return Response(
            content=content,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.md"'},
        )
    elif format == "pdf":
        pdf_bytes = export_pdf(meeting, meeting.summary, meeting.action_items)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.pdf"'},
        )
    elif format == "docx":
        docx_bytes = export_docx(meeting, meeting.summary, meeting.action_items, meeting.transcript)
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.docx"'},
        )
    elif format == "txt":
        txt_content = export_txt(meeting, meeting.summary, meeting.action_items, meeting.transcript)
        return Response(
            content=txt_content,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.txt"'},
        )
    elif format == "json":
        json_content = export_json(
            meeting, meeting.summary, meeting.action_items, meeting.transcript
        )
        return Response(
            content=json_content,
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.json"'},
        )
    elif format == "srt":
        srt_content = export_srt(meeting.transcript)
        return Response(
            content=srt_content,
            media_type="application/x-subrip; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.srt"'},
        )
    elif format == "vtt":
        vtt_content = export_vtt(meeting.transcript)
        return Response(
            content=vtt_content,
            media_type="text/vtt; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.vtt"'},
        )
    elif format == "ics":
        ics_content = export_ics(meeting, meeting.action_items)
        return Response(
            content=ics_content,
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.ics"'},
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported format")


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

    # Dispatch action_item.created webhook
    try:
        from app.db.models import Webhook
        from app.services.webhooks import send_single_webhook_async

        wh_stmt = select(Webhook).where(
            Webhook.user_id == current_user.id,
            Webhook.is_active.is_(True),
        )
        wh_res = await db.execute(wh_stmt)
        for wh in wh_res.scalars().all():
            if "action_item.created" in wh.events:
                await send_single_webhook_async(
                    wh,
                    "action_item.created",
                    {
                        "event": "action_item.created",
                        "meeting_id": str(meeting.id),
                        "action_item_id": str(item.id),
                        "description": item.description,
                        "owner": item.owner,
                        "due_date": item.due_date.isoformat() if item.due_date else None,
                        "priority": item.priority,
                        "status": item.status,
                    },
                    db,
                )
    except Exception:
        pass

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
