"""LLM analysis orchestration (docs/ARCHITECTURE.md "LLM analysis service").

Turns a transcript into a `MeetingAnalysis`:

- Short transcripts (at/under `ANALYSIS_TOKEN_BUDGET`) go in a single call.
- Long ones use map-reduce: consecutive `MAP_WINDOW_SEC` windows are summarized into
  `PartialAnalysis` objects, then one final call merges them (D38).
- Every LLM response is validated with Pydantic; a validation failure triggers exactly
  one retry with the error appended (AGENTS.md rule 7, docs/PROMPTS.md).
- The transcript is treated as data; prompts say so explicitly (docs/PROMPTS.md).

Nothing here talks to the database or the pipeline: `analysis_service.analyze` is pure
over a list of `Segment` plus a few scalars, and returns a `MeetingAnalysis`.
"""

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import TypeVar

from pydantic import BaseModel

from app.core.config import get_settings
from app.schemas.analysis import ActionItemDraft, MeetingAnalysis, PartialAnalysis
from app.services import prompts
from app.services.llm import LLMClient, LLMError, LLMValidationError
from app.services.transcription import Segment

logger = logging.getLogger(__name__)

SchemaT = TypeVar("SchemaT", bound=BaseModel)

# Rough token estimate: ~4 characters per token (D37). No tokenizer dependency.
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    """Approximate the token count of `text` (D37)."""
    return max(0, len(text) // CHARS_PER_TOKEN)


def format_timestamp(seconds: float) -> str:
    """Format a seconds offset as `[HH:MM:SS]` for the timestamped transcript."""
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"[{hours:02d}:{minutes:02d}:{secs:02d}]"


def format_timestamped_transcript(segments: Sequence[Segment]) -> str:
    """One `[HH:MM:SS] text` line per non-empty segment (docs/PROMPTS.md)."""
    lines = [
        f"{format_timestamp(segment.start)} {segment.text.strip()}"
        for segment in segments
        if segment.text.strip()
    ]
    return "\n".join(lines)


@dataclass(frozen=True, slots=True)
class Window:
    """A slice of the transcript covering `[start_sec, end_sec)` within one window."""

    start_sec: float
    end_sec: float
    segments: list[Segment]

    def as_text(self) -> str:
        return format_timestamped_transcript(self.segments)


def split_into_windows(segments: Sequence[Segment], window_sec: int) -> list[Window]:
    """Group consecutive segments into ~`window_sec` windows for the map step (D38)."""
    if window_sec <= 0:
        return [Window(0.0, _last_end(segments), list(segments))]

    windows: list[Window] = []
    current: list[Segment] = []
    window_start = 0.0
    for segment in segments:
        if current and segment.start >= window_start + window_sec:
            windows.append(Window(window_start, window_start + window_sec, current))
            window_start = (segment.start // window_sec) * window_sec
            current = []
        current.append(segment)
    if current:
        windows.append(Window(window_start, _last_end(current), current))
    return windows


def _last_end(segments: Sequence[Segment]) -> float:
    return segments[-1].end if segments else 0.0


def merge_action_items(items: Sequence[ActionItemDraft]) -> list[ActionItemDraft]:
    """Deduplicate action items by description, keeping the earliest source offset (D40)."""
    best: dict[str, ActionItemDraft] = {}
    for item in items:
        key = item.description.strip().lower()
        existing = best.get(key)
        if existing is None:
            best[key] = item
            continue
        if _earlier(item, existing):
            best[key] = item
    return list(best.values())


def _earlier(candidate: ActionItemDraft, current: ActionItemDraft) -> bool:
    if candidate.source_start_sec is None:
        return False
    if current.source_start_sec is None:
        return True
    return candidate.source_start_sec < current.source_start_sec


def analyze(
    *,
    llm: LLMClient,
    segments: Sequence[Segment],
    meeting_date: date,
    language: str | None,
) -> MeetingAnalysis:
    """Produce a validated `MeetingAnalysis` for a transcript.

    Chooses single-pass or map-reduce by the estimated transcript size (D38) and enforces
    the one-retry validation rule (D39). Raises `LLMError` subclasses on failure so the
    pipeline can classify the error.
    """
    settings = get_settings()
    transcript_text = format_timestamped_transcript(segments)
    if not transcript_text:
        raise LLMError("Cannot analyze an empty transcript")

    if estimate_tokens(transcript_text) <= settings.analysis_token_budget:
        return _single_pass(llm, transcript_text, meeting_date, language)

    logger.info(
        "Transcript exceeds token budget; using map-reduce",
        extra={"estimated_tokens": estimate_tokens(transcript_text)},
    )
    return _map_reduce(llm, segments, meeting_date, language, settings.map_window_sec)


def _single_pass(
    llm: LLMClient,
    transcript_text: str,
    meeting_date: date,
    language: str | None,
) -> MeetingAnalysis:
    user = prompts.ANALYSIS_USER_TEMPLATE_V1.format(
        meeting_date=meeting_date.isoformat(),
        language=language or "unknown",
        timestamped_transcript=transcript_text,
    )
    return _complete_with_retry(llm, prompts.ANALYSIS_SYSTEM_PROMPT_V1, user, MeetingAnalysis)


def _map_reduce(
    llm: LLMClient,
    segments: Sequence[Segment],
    meeting_date: date,
    language: str | None,
    window_sec: int,
) -> MeetingAnalysis:
    windows = split_into_windows(segments, window_sec)
    partials: list[PartialAnalysis] = []
    for window in windows:
        system = prompts.MAP_SYSTEM_PROMPT_V1.format(
            start=format_timestamp(window.start_sec),
            end=format_timestamp(window.end_sec),
        )
        user = prompts.ANALYSIS_USER_TEMPLATE_V1.format(
            meeting_date=meeting_date.isoformat(),
            language=language or "unknown",
            timestamped_transcript=window.as_text(),
        )
        partials.append(_complete_with_retry(llm, system, user, PartialAnalysis))

    return _reduce(llm, partials, meeting_date, language)


def _reduce(
    llm: LLMClient,
    partials: Sequence[PartialAnalysis],
    meeting_date: date,
    language: str | None,
) -> MeetingAnalysis:
    payload = {
        "meeting_date": meeting_date.isoformat(),
        "language": language or "unknown",
        "partial_notes": [
            {
                "partial_summary": partial.partial_summary,
                "key_points": partial.key_points,
                "decisions": partial.decisions,
                "action_items": [item.model_dump(mode="json") for item in partial.action_items],
            }
            for partial in partials
        ],
    }
    user = json.dumps(payload, ensure_ascii=False)
    analysis = _complete_with_retry(llm, prompts.REDUCE_SYSTEM_PROMPT_V1, user, MeetingAnalysis)
    # The reduce prompt asks the model to dedupe; enforce it deterministically too (D40).
    return analysis.model_copy(update={"action_items": merge_action_items(analysis.action_items)})


def _complete_with_retry(
    llm: LLMClient,
    system: str,
    user: str,
    schema: type[SchemaT],
) -> SchemaT:
    """Call the LLM, retrying exactly once on a validation failure (D39)."""
    try:
        return llm.complete_json(system, user, schema)
    except LLMValidationError as exc:
        logger.warning("LLM output invalid; retrying once", extra={"error": str(exc)})
        retry_user = f"{user}\n\n{prompts.VALIDATION_RETRY_SUFFIX.format(error=str(exc))}"
        return llm.complete_json(system, retry_user, schema)


def meeting_date_for(created_at: datetime) -> date:
    """The date used to resolve relative due dates: when the meeting was created (D40)."""
    return created_at.date()


__all__ = [
    "analyze",
    "estimate_tokens",
    "format_timestamp",
    "format_timestamped_transcript",
    "meeting_date_for",
    "merge_action_items",
    "split_into_windows",
]
