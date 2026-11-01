import uuid
from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


# --- Share Links Schemas ---
class ShareLinkCreateRequest(BaseModel):
    expires_in_days: Optional[int] = Field(
        default=None, description="Expiration in days (e.g. 7, 30). None means never expires."
    )
    password: Optional[str] = Field(
        default=None, min_length=4, max_length=128, description="Optional password protection"
    )
    hide_transcript: bool = Field(
        default=False, description="Whether to hide the transcript in the public share view"
    )


class ShareLinkResponse(BaseModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    token: Optional[str] = None
    share_url: Optional[str] = None
    has_password: bool = False
    expires_at: Optional[datetime] = None
    hide_transcript: bool = False
    view_count: int = 0
    is_revoked: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class PublicShareUnlockRequest(BaseModel):
    password: str = Field(..., min_length=1)


class PublicActionItem(BaseModel):
    id: uuid.UUID
    description: str
    owner: Optional[str] = None
    due_date: Optional[date] = None
    priority: str
    status: str


class PublicSummary(BaseModel):
    summary: str
    key_points: List[str] = Field(default_factory=list)
    decisions: List[str] = Field(default_factory=list)


class PublicTranscriptSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str


class PublicTranscript(BaseModel):
    full_text: str
    segments: List[PublicTranscriptSegment] = Field(default_factory=list)


class PublicShareResponse(BaseModel):
    title: str
    created_at: Optional[datetime] = None
    duration_sec: Optional[float] = None
    language: Optional[str] = "en"
    summary: Optional[PublicSummary] = None
    action_items: List[PublicActionItem] = Field(default_factory=list)
    transcript: Optional[PublicTranscript] = None
    hide_transcript: bool = False


# --- Webhooks Schemas ---
class WebhookCreateRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=1000)
    events: List[str] = Field(
        default=["meeting.completed", "meeting.failed", "action_item.created"]
    )


class WebhookUpdateRequest(BaseModel):
    url: Optional[str] = Field(None, min_length=8, max_length=1000)
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None


class WebhookResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    url: str
    secret: str
    events: List[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WebhookDeliveryResponse(BaseModel):
    id: uuid.UUID
    webhook_id: uuid.UUID
    event: str
    payload: Any
    status_code: Optional[int] = None
    response_body: Optional[str] = None
    success: bool
    attempts: int
    created_at: datetime

    class Config:
        from_attributes = True
