import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_owned_meeting
from app.core.config import settings
from app.db.models import Meeting, User
from app.db.session import get_db
from app.schemas.meeting import (
    MeetingCreateRequest,
    MeetingStatusResponse,
    MeetingUploadResponse,
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

    return MeetingStatusResponse(
        meeting_id=meeting.id,
        status=meeting.status,
        stage=meeting.stage,
        progress_pct=meeting.progress_pct,
        error_message=meeting.error_message,
        process_attempts=meeting.process_attempts,
    )
