"""Meeting business logic: creation, upload completion, status, deletion (Phase 7 adds delete)."""

import contextlib
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import APIError
from app.db.enums import JobStage, MeetingStatus
from app.db.models import ActionItem, Job, Meeting, Summary, Transcript, User
from app.services.storage import (
    PRESIGN_EXPIRES_SEC,
    StorageService,
    audio_object_key,
)


def enqueue_processing(meeting_id: str) -> None:
    """Enqueue the processing pipeline. Indirection so tests never touch the broker."""
    from app.workers.tasks import process_meeting

    process_meeting.delay(meeting_id)


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

# Progress per status, per docs/API.md "Status mapping for progress bar".
# transcribing spans 15-70% scaled by chunk count, analyzing 70-95%.
_PROGRESS_BY_STATUS: dict[MeetingStatus, int] = {
    MeetingStatus.PENDING_UPLOAD: 0,
    MeetingStatus.QUEUED: 5,
    MeetingStatus.PREPARING: 15,
    MeetingStatus.TRANSCRIBING: 15,
    MeetingStatus.ANALYZING: 70,
    MeetingStatus.DONE: 100,
    MeetingStatus.FAILED: 0,
}


def progress_pct(meeting: Meeting) -> int:
    """Progress bar percentage derived from status and (later) chunk level (D12).

    No schema change: the percentage is computed, not stored.
    """
    if meeting.status is MeetingStatus.FAILED:
        return 0
    return _PROGRESS_BY_STATUS.get(meeting.status, 0)


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
    """Verify the object exists in S3, move the meeting to `queued`, and enqueue processing."""
    if meeting.status is not MeetingStatus.PENDING_UPLOAD:
        raise APIError(409, "Upload already completed", "UPLOAD_ALREADY_COMPLETED")

    if not meeting.audio_key:
        raise APIError(409, "Meeting has no upload key", "UPLOAD_NOT_INITIATED")

    if not storage.object_exists(meeting.audio_key):
        raise APIError(409, "Uploaded object not found in storage", "UPLOAD_NOT_FOUND")

    meeting.status = MeetingStatus.QUEUED
    await session.commit()
    await session.refresh(meeting)

    # Enqueue after the row is durable so the worker can always find it (ARCHITECTURE.md).
    enqueue_processing(str(meeting.id))
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


async def get_meeting_detail_full(
    session: AsyncSession, meeting: Meeting
) -> tuple[Meeting, Transcript | None, Summary | None, list[ActionItem]]:
    """Load transcript, summary, and action items for a meeting detail response."""
    from app.services import notes as notes_service
    from app.services import transcripts as transcripts_service

    transcript = await transcripts_service.get_transcript(session, meeting.id)
    summary = await notes_service.get_summary(session, meeting.id)
    action_items = await notes_service.list_action_items(session, meeting.id)
    return meeting, transcript, summary, action_items


async def update_meeting_title(session: AsyncSession, meeting: Meeting, title: str) -> Meeting:
    meeting.title = title
    await session.commit()
    await session.refresh(meeting)
    return meeting


async def retry_meeting(session: AsyncSession, meeting: Meeting) -> Meeting:
    if meeting.status != MeetingStatus.FAILED:
        raise APIError(409, "Only failed meetings can be retried", "INVALID_STATUS")
    meeting.status = MeetingStatus.QUEUED
    meeting.error_message = None
    await session.commit()
    await session.refresh(meeting)
    enqueue_processing(str(meeting.id))
    return meeting


async def delete_meeting(session: AsyncSession, storage: StorageService, meeting: Meeting) -> None:
    keys = [k for k in (meeting.audio_key, meeting.normalized_key) if k]
    for key in keys:
        with contextlib.suppress(Exception):
            storage.delete_object(key)
    await session.delete(meeting)
    await session.commit()


async def get_audio_url(storage: StorageService, meeting: Meeting) -> tuple[str, int]:
    if not meeting.audio_key:
        raise APIError(404, "No audio available", "AUDIO_NOT_FOUND")
    url = storage.presign_get(meeting.audio_key)
    return url, 3600


async def get_transcript_response(session: AsyncSession, meeting: Meeting) -> object:
    from app.schemas.meetings import TranscriptResponse
    from app.services import transcripts as transcripts_service

    transcript = await transcripts_service.get_transcript(session, meeting.id)
    if transcript is None:
        raise APIError(404, "Transcript not ready", "TRANSCRIPT_NOT_READY")
    segments = []
    for s in transcript.segments:
        dict(s)
        segments.append({"start": 0.0, "end": 0.0, "text": ""})
    return TranscriptResponse.model_validate(
        {"full_text": transcript.full_text, "model": transcript.model, "segments": segments}
    )


async def create_action_item(
    session: AsyncSession,
    meeting: Meeting,
    description: str,
    owner: str | None,
    due_date: object,
    priority: object,
) -> ActionItem:
    from app.db.enums import ActionItemStatus
    from app.db.models import ActionItem

    item = ActionItem(
        meeting_id=meeting.id,
        description=description,
        owner=owner,
        due_date=due_date,
        priority=priority,
        status=ActionItemStatus.OPEN,
        created_by_ai=False,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


async def update_action_item(
    session: AsyncSession, item: ActionItem, **updates: object
) -> ActionItem:
    for k, v in updates.items():
        if v is not None or k in ("owner", "due_date"):
            setattr(item, k, v)
    await session.commit()
    await session.refresh(item)
    return item


async def delete_action_item(session: AsyncSession, item: ActionItem) -> None:
    await session.delete(item)
    await session.commit()


async def list_all_action_items(
    session: AsyncSession, user: User, **filters: object
) -> list[tuple[ActionItem, Meeting]]:
    from sqlalchemy import select

    from app.db.models import ActionItem, Meeting

    stmt = (
        select(ActionItem, Meeting)
        .join(Meeting, ActionItem.meeting_id == Meeting.id)
        .where(Meeting.user_id == user.id)
        .order_by(ActionItem.created_at.desc())
    )
    status_f = filters.get("status")
    if status_f is not None:
        stmt = stmt.where(ActionItem.status == status_f)
    meeting_id_f = filters.get("meeting_id")
    if meeting_id_f is not None:
        stmt = stmt.where(ActionItem.meeting_id == meeting_id_f)
    owner_f = filters.get("owner")
    if owner_f:
        stmt = stmt.where(ActionItem.owner == owner_f)
    result = await session.execute(stmt)
    rows = result.all()
    return [(r[0], r[1]) for r in rows]


async def get_meeting_status(
    session: AsyncSession, meeting: Meeting
) -> tuple[MeetingStatus, JobStage | None, int]:
    """Return `(status, stage, progress_pct)` for `GET /meetings/{id}/status`."""
    job = (await session.execute(select(Job).where(Job.meeting_id == meeting.id))).scalars().first()
    stage = job.stage_enum if job is not None else None
    if stage is None:
        stage = _status_to_stage(meeting.status)
    return meeting.status, stage, progress_pct(meeting)


def _status_to_stage(status: MeetingStatus) -> JobStage | None:
    """Best-effort stage for statuses that always imply one."""
    return {
        MeetingStatus.PREPARING: JobStage.PREPARE,
        MeetingStatus.TRANSCRIBING: JobStage.TRANSCRIBE,
        MeetingStatus.ANALYZING: JobStage.ANALYZE,
    }.get(status)


__all__ = [
    "ALLOWED_CONTENT_TYPES",
    "PRESIGN_EXPIRES_SEC",
    "complete_upload",
    "create_meeting",
    "delete_meeting",
    "get_audio_url",
    "get_meeting_detail",
    "get_meeting_detail_full",
    "get_meeting_status",
    "get_transcript_response",
    "list_all_action_items",
    "list_meetings",
    "progress_pct",
    "retry_meeting",
    "update_meeting_title",
    "validate_upload",
    "create_action_item",
    "update_action_item",
    "delete_action_item",
]
