"""Meeting business logic: creation, upload completion, deletion (Phase 7 adds delete)."""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import APIError
from app.db.enums import MeetingStatus
from app.db.models import Meeting, User
from app.services.storage import (
    PRESIGN_EXPIRES_SEC,
    StorageService,
    audio_object_key,
)

# PRD F1 allowed formats.
ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/mp4",
        "audio/m4a",
        "audio/x-m4a",
        "audio/webm",
        "audio/ogg",
        "video/mp4",
        "video/webm",
    }
)

ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg"})


def validate_upload(content_type: str, size_bytes: int, filename: str) -> None:
    """Enforce the format and size limits from PRD F1 / AGENTS.md."""
    settings = get_settings()
    if size_bytes > settings.max_upload_bytes:
        raise APIError(
            413,
            f"File exceeds the {settings.max_upload_mb} MB limit",
            "FILE_TOO_LARGE",
        )

    lowered = filename.lower()
    has_allowed_ext = any(lowered.endswith(ext) for ext in ALLOWED_EXTENSIONS)
    # A generic type (e.g. application/octet-stream) is accepted only when the filename
    # extension is one of the allowed formats; otherwise the content type must be allowed.
    generic_types = {"application/octet-stream", ""}
    if content_type in ALLOWED_CONTENT_TYPES:
        return
    if content_type in generic_types and has_allowed_ext:
        return
    raise APIError(
        415,
        "Unsupported file type. Allowed: mp3, wav, m4a, mp4, webm, ogg",
        "UNSUPPORTED_TYPE",
    )


async def create_meeting(
    session: AsyncSession,
    storage: StorageService,
    user: User,
    filename: str,
    content_type: str,
    size_bytes: int,
) -> tuple[Meeting, str]:
    """Create a `pending_upload` meeting and return it with its presigned PUT URL."""
    validate_upload(content_type, size_bytes, filename)

    meeting = Meeting(
        user_id=user.id,
        title=filename,
        original_filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
        status=MeetingStatus.PENDING_UPLOAD,
    )
    session.add(meeting)
    await session.flush()  # assign id before building the key

    key = audio_object_key(str(user.id), str(meeting.id), filename)
    meeting.audio_key = key
    await session.commit()
    await session.refresh(meeting)

    upload_url = storage.presign_put(key, content_type)
    return meeting, upload_url


async def complete_upload(
    session: AsyncSession, storage: StorageService, meeting: Meeting
) -> Meeting:
    """Verify the object exists in S3 and move the meeting to `queued`."""
    if meeting.status is not MeetingStatus.PENDING_UPLOAD:
        raise APIError(409, "Upload already completed", "UPLOAD_ALREADY_COMPLETED")

    if not meeting.audio_key:
        raise APIError(409, "Meeting has no upload key", "UPLOAD_NOT_INITIATED")

    if not storage.object_exists(meeting.audio_key):
        raise APIError(409, "Uploaded object not found in storage", "UPLOAD_NOT_FOUND")

    meeting.status = MeetingStatus.QUEUED
    await session.commit()
    await session.refresh(meeting)
    return meeting


async def list_meetings(
    session: AsyncSession,
    user: User,
    *,
    q: str | None = None,
    status: MeetingStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Meeting], int]:
    """Paginated, searchable, owner-scoped meeting list."""
    filters = [Meeting.user_id == user.id]
    if status is not None:
        filters.append(Meeting.status == status)
    if q:
        like = f"%{q}%"
        filters.append(or_(Meeting.title.ilike(like), Meeting.original_filename.ilike(like)))

    count_stmt = select(func.count()).select_from(Meeting).where(*filters)
    total = int((await session.execute(count_stmt)).scalar_one())

    stmt = (
        select(Meeting)
        .where(*filters)
        .order_by(Meeting.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    meetings = list((await session.execute(stmt)).scalars().all())
    return meetings, total


async def get_meeting_detail(session: AsyncSession, meeting_id: uuid.UUID) -> Meeting | None:
    return await session.get(Meeting, meeting_id)


__all__ = [
    "ALLOWED_CONTENT_TYPES",
    "PRESIGN_EXPIRES_SEC",
    "complete_upload",
    "create_meeting",
    "list_meetings",
    "validate_upload",
]
