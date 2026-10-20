"""Meeting schemas (docs/API.md, docs/DATABASE.md)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import ActionItemStatus, JobStage, MeetingStatus, Priority


class CreateMeetingRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=512)
    content_type: str
    size_bytes: int = Field(gt=0)


class CreateMeetingResponse(BaseModel):
    meeting_id: uuid.UUID
    upload_url: str
    upload_headers: dict[str, str]
    expires_in: int


class ActionItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    description: str
    owner: str | None
    due_date: date | None
    priority: Priority
    status: ActionItemStatus
    source_start_sec: float | None


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscriptResponse(BaseModel):
    full_text: str
    model: str
    segments: list[TranscriptSegment]


class SummaryResponse(BaseModel):
    summary: str
    key_points: list[str]
    decisions: list[str]


class MeetingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    original_filename: str
    status: MeetingStatus
    duration_sec: float | None
    language: str | None
    created_at: datetime
    error_message: str | None


class MeetingDetail(BaseModel):
    id: uuid.UUID
    title: str | None
    original_filename: str
    status: MeetingStatus
    duration_sec: float | None
    language: str | None
    created_at: datetime
    error_message: str | None
    summary: SummaryResponse | None = None
    action_items: list[ActionItemResponse] = []


class PaginatedMeetings(BaseModel):
    items: list[MeetingListItem]
    page: int
    page_size: int
    total: int


class MeetingStatusResponse(BaseModel):
    """`GET /meetings/{id}/status` (docs/API.md)."""

    status: MeetingStatus
    stage: JobStage | None
    progress_pct: int
    error_message: str | None = None
