import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.organization import TagResponse


class MeetingCreateRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., min_length=1, max_length=100)
    size_bytes: int = Field(..., gt=0)


class MeetingUploadResponse(BaseModel):
    meeting_id: uuid.UUID
    upload_url: str
    upload_method: str = "PUT"
    upload_headers: dict[str, str]
    expires_in: int
    storage_backend: str


class MeetingStatusResponse(BaseModel):
    meeting_id: uuid.UUID
    status: str
    stage: Optional[str] = None
    progress_pct: float = 0.0
    error_message: Optional[str] = None
    process_attempts: int = 0


class MeetingUpdateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty or whitespace")
        return v


class MeetingListItem(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    duration_sec: Optional[float] = None
    created_at: datetime
    has_transcript: bool = False
    action_items_count: int = 0
    folder_id: Optional[uuid.UUID] = None
    is_starred: bool = False
    is_pinned: bool = False
    tags: List[TagResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class MeetingListResponse(BaseModel):
    items: List[MeetingListItem]
    total: int
    page: int
    page_size: int


class SummaryResponse(BaseModel):
    summary: str
    key_points: List[str]
    decisions: List[str]

    model_config = {"from_attributes": True}


class ActionItemResponse(BaseModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    meeting_title: Optional[str] = None
    description: str
    owner: Optional[str] = None
    due_date: Optional[date] = None
    priority: str = "medium"
    status: str = "open"
    source_start_sec: Optional[float] = None
    created_by_ai: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ActionItemListResponse(BaseModel):
    items: List[ActionItemResponse]
    total: int
    page: int
    page_size: int


class ActionItemCreateRequest(BaseModel):
    description: str = Field(..., min_length=1)
    owner: Optional[str] = None
    due_date: Optional[date] = None
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    status: str = Field(default="open", pattern="^(open|in_progress|done|completed|cancelled)$")

    @field_validator("description")
    @classmethod
    def validate_desc(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Description cannot be empty or whitespace")
        return v


class ActionItemUpdateRequest(BaseModel):
    description: Optional[str] = Field(None, min_length=1)
    owner: Optional[str] = None
    due_date: Optional[date] = None
    priority: Optional[str] = Field(None, pattern="^(low|medium|high)$")
    status: Optional[str] = Field(None, pattern="^(open|in_progress|done|completed|cancelled)$")

    @field_validator("description")
    @classmethod
    def validate_desc(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Description cannot be empty or whitespace")
        return v


class MeetingDetailResponse(BaseModel):
    id: uuid.UUID
    title: str
    title_edited: bool = False
    status: str
    stage: Optional[str] = None
    progress_pct: float = 0.0
    error_message: Optional[str] = None
    duration_sec: Optional[float] = None
    language: Optional[str] = None
    has_transcript: bool = False
    folder_id: Optional[uuid.UUID] = None
    is_starred: bool = False
    is_pinned: bool = False
    template: str = "general"
    created_at: datetime
    updated_at: datetime
    tags: List[TagResponse] = Field(default_factory=list)
    summary: Optional[SummaryResponse] = None
    action_items: List[ActionItemResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TranscriptSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str


class TranscriptResponse(BaseModel):
    language: str = "en"
    full_text: str
    segments: List[TranscriptSegment] = Field(default_factory=list)
    matching_segment_ids: Optional[List[int]] = None


class AudioUrlResponse(BaseModel):
    url: str
    expires_in: int = 900
