import uuid
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator


class TagResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TagCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field(default="#3b82f6", max_length=32)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Tag name cannot be empty")
        return v


class MeetingTagsUpdateRequest(BaseModel):
    tag_ids: List[uuid.UUID]


class FolderResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    meeting_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class FolderCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#6366f1", max_length=32)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Folder name cannot be empty")
        return v


class FolderUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, max_length=32)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Folder name cannot be empty")
        return v


class FolderListResponse(BaseModel):
    items: List[FolderResponse]


class MeetingOrganizeRequest(BaseModel):
    folder_id: Optional[uuid.UUID] = None
    is_starred: Optional[bool] = None
    is_pinned: Optional[bool] = None


class MeetingBulkRequest(BaseModel):
    meeting_ids: List[uuid.UUID] = Field(..., min_length=1)
    action: str = Field(..., pattern="^(star|unstar|pin|unpin|move|tag|trash|delete)$")
    folder_id: Optional[uuid.UUID] = None
    tag_ids: Optional[List[uuid.UUID]] = None


class MeetingBulkResponse(BaseModel):
    affected_count: int
    action: str
    undo_payload: Optional[dict[str, Any]] = None


class BookmarkResponse(BaseModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    timestamp_sec: float
    note: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BookmarkCreateRequest(BaseModel):
    timestamp_sec: float = Field(..., ge=0.0)
    note: str = Field(..., min_length=1)

    @field_validator("note")
    @classmethod
    def clean_note(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Note cannot be empty")
        return v


class SegmentEditRequest(BaseModel):
    segment_index: int = Field(..., ge=0)
    text: str = Field(..., min_length=1)

    @field_validator("text")
    @classmethod
    def clean_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Segment text cannot be empty")
        return v


class MeetingPasteRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    transcript_text: str = Field(..., min_length=10)

    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty")
        return v


class TrashItemResponse(BaseModel):
    id: uuid.UUID
    title: str
    duration_sec: Optional[float] = None
    created_at: datetime
    deleted_at: datetime
    days_until_purge: int = 30

    model_config = {"from_attributes": True}


class TrashListResponse(BaseModel):
    items: List[TrashItemResponse]
    total: int
