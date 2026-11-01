import uuid
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.services.llm import ActionItemAnalysis


class ChatMessageRequest(BaseModel):
    content: Optional[str] = None
    message: Optional[str] = None

    @property
    def text(self) -> str:
        res = (self.message or self.content or "").strip()
        if not res:
            raise ValueError("Message content cannot be empty")
        return res


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    citations: List[Any] = Field(default_factory=list)
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    meeting_id: Optional[uuid.UUID]
    messages: List[ChatMessageResponse]


class GlobalChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)


class GlobalChatReference(BaseModel):
    meeting_id: uuid.UUID
    title: str
    snippet: str


class GlobalChatResponse(BaseModel):
    answer: str
    references: List[GlobalChatReference] = Field(default_factory=list)


class RegenerateRequest(BaseModel):
    template: str = Field(
        default="general",
        pattern="^(general|standup|one_on_one|sales|interview|lecture)$",
    )


class ChapterItem(BaseModel):
    title: str
    start_sec: float
    end_sec: float
    summary: str


class MeetingChaptersResponse(BaseModel):
    meeting_id: Optional[uuid.UUID] = None
    chapters: List[ChapterItem]


class FollowUpEmailRequest(BaseModel):
    tone: str = Field(default="friendly", pattern="^(formal|friendly|brief)$")


class FollowUpEmailResponse(BaseModel):
    subject: str
    recipient_suggestion: str
    body: str


class TranslateRequest(BaseModel):
    target_language: str = Field(..., min_length=2, max_length=50)


class TranslatedNotesResponse(BaseModel):
    language: str
    title: str
    summary: str
    key_points: List[str]
    decisions: List[str]
    action_items: List[ActionItemAnalysis]


class SpeakerInsight(BaseModel):
    speaker: str
    talk_time_pct: float


class MeetingInsightsResponse(BaseModel):
    sentiment: str  # positive, neutral, mixed, concerned
    pace_wpm: int
    top_keywords: List[str]
    unanswered_questions: List[str]
    speaker_distribution: List[SpeakerInsight]
