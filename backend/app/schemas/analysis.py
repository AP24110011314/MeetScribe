"""LLM analysis schemas (docs/ARCHITECTURE.md, docs/PROMPTS.md).

These models are the contract between the LLM and the database. The LLM is asked to
return JSON matching exactly this shape, and the response is validated with Pydantic
before anything is persisted (AGENTS.md rule 7).
"""

from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.db.enums import Priority


class ActionItemDraft(BaseModel):
    """One action item as produced by the LLM (no id/status yet; those are DB concerns)."""

    description: str = Field(min_length=1, max_length=2000)
    # Owner is the name exactly as spoken, or null when not stated. Never guessed.
    owner: str | None = Field(default=None, max_length=200)
    due_date: date | None = None
    priority: Priority = Priority.MEDIUM
    source_start_sec: float | None = Field(default=None, ge=0)

    @field_validator("owner", "due_date", mode="before")
    @classmethod
    def _empty_string_is_none(cls, value: object) -> object:
        """Treat `""` and whitespace as "not stated" (LLMs sometimes emit empty strings)."""
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("owner", mode="after")
    @classmethod
    def _strip_owner(cls, value: str | None) -> str | None:
        return value.strip() if value else None


class MeetingAnalysis(BaseModel):
    """Full analysis of one meeting (single-pass output, or the reduce-step result)."""

    summary: str = Field(min_length=1)
    key_points: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    action_items: list[ActionItemDraft] = Field(default_factory=list)
    suggested_title: str = Field(default="", max_length=200)

    @field_validator("key_points", "decisions", mode="before")
    @classmethod
    def _drop_blank_strings(cls, value: object) -> object:
        if isinstance(value, list):
            return [item for item in value if isinstance(item, str) and item.strip()]
        return value


class PartialAnalysis(BaseModel):
    """One map-step result: notes for a single time window of a long meeting."""

    partial_summary: str = Field(min_length=1)
    key_points: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    action_items: list[ActionItemDraft] = Field(default_factory=list)

    @field_validator("key_points", "decisions", mode="before")
    @classmethod
    def _drop_blank_strings(cls, value: object) -> object:
        if isinstance(value, list):
            return [item for item in value if isinstance(item, str) and item.strip()]
        return value
