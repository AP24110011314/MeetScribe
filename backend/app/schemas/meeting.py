import uuid
from typing import Optional

from pydantic import BaseModel, Field


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
