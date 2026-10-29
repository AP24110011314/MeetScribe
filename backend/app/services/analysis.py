import json
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ActionItem, Meeting, Summary, Transcript
from app.services.llm import (
    LLMClient,
    MeetingAnalysis,
    SectionAnalysis,
    get_llm_client,
)

logger = logging.getLogger(__name__)

SINGLE_PASS_SYSTEM_PROMPT = """You are an expert executive meeting assistant. Your task is to analyze meeting transcripts and produce an accurate, structured summary, key points, decisions, suggested meeting title, and action items.

CRITICAL INSTRUCTIONS:
1. Always respond in valid JSON conforming exactly to the requested schema.
2. For action item owners: ONLY use names explicitly stated in the transcript. If an action item has no assigned owner, set "owner" to null. NEVER invent or hallucinate owners.
3. For due dates: ONLY extract dates or relative deadlines explicitly stated in the context (resolved relative to the meeting date if known). If no deadline is specified, set "due_date" to null.
4. Summary must be concise, objective, and maximum ~250 words.
5. Key points must contain between 3 and 10 items.
6. Decisions must capture clear agreements made by the participants.
7. Return raw JSON without markdown code fences or explanatory text.
"""

MAP_SYSTEM_PROMPT = """You are an expert meeting assistant. You are summarizing a section of a longer meeting transcript.
Extract intermediate key points, decisions, and potential action items with timestamps and owners.
Return valid JSON matching the schema.
"""

REDUCE_SYSTEM_PROMPT = """You are an expert executive meeting assistant. You are merging intermediate notes from several chronological sections of a meeting into one coherent final meeting analysis.

CRITICAL INSTRUCTIONS:
1. Deduplicate repeated action items across sections while preserving the earliest source timestamp.
2. Synthesize an executive overall summary (maximum ~250 words).
3. Combine and refine 3 to 10 overall key points and all concrete decisions.
4. Suggest a clear, descriptive meeting title.
5. Return valid JSON matching the MeetingAnalysis schema.
"""


class AnalysisService:
    def __init__(self, llm_client: Optional[LLMClient] = None) -> None:
        self.llm_client = llm_client or get_llm_client()

    def analyze_transcript(self, transcript: Transcript, meeting: Meeting) -> MeetingAnalysis:
        """
        Analyzes meeting transcript: uses single-pass for standard meetings (<= 20k tokens)
        and map-reduce for long transcripts.
        """
        # Estimate token count (~4 chars per token)
        estimated_tokens = len(transcript.full_text) // 4
        logger.info(
            "Analyzing meeting %s transcript (~%d tokens)",
            meeting.id,
            estimated_tokens,
        )

        meeting_date_str = (
            meeting.created_at.strftime("%Y-%m-%d")
            if meeting.created_at
            else datetime.now().strftime("%Y-%m-%d")
        )

        if estimated_tokens <= 20000:
            return self._single_pass_analysis(transcript, meeting_date_str)
        else:
            return self._map_reduce_analysis(transcript, meeting_date_str)

    def _single_pass_analysis(
        self, transcript: Transcript, meeting_date_str: str
    ) -> MeetingAnalysis:
        user_prompt = (
            f"Meeting Date Reference (if known): {meeting_date_str}\n\n"
            f"Transcript:\n"
            f"{transcript.full_text}\n\n"
            f"Please analyze this transcript and return the JSON analysis."
        )

        return self.llm_client.complete_json(
            system=SINGLE_PASS_SYSTEM_PROMPT,
            user=user_prompt,
            schema=MeetingAnalysis,
        )

    def _map_reduce_analysis(
        self, transcript: Transcript, meeting_date_str: str
    ) -> MeetingAnalysis:
        logger.info("Executing map-reduce analysis for long meeting transcript")

        segments = transcript.segments or []
        # Group segments into 10-minute (600s) windows
        windows: List[List[dict[str, Any]]] = []
        current_window: List[dict[str, Any]] = []
        current_window_end = 600.0

        for seg in segments:
            seg_start = seg.get("start", 0.0)
            if seg_start > current_window_end and current_window:
                windows.append(current_window)
                current_window = [seg]
                current_window_end = (seg_start // 600.0 + 1) * 600.0
            else:
                current_window.append(seg)

        if current_window:
            windows.append(current_window)

        # If no segmented windows found, fall back to single-pass
        if not windows:
            return self._single_pass_analysis(transcript, meeting_date_str)

        # 1. Map Phase: analyze each window
        section_results: List[SectionAnalysis] = []
        for idx, win in enumerate(windows):
            window_text = " ".join(f"[{s.get('start', 0.0):.1f}s] {s.get('text', '')}" for s in win)
            map_user_prompt = f"Section {idx + 1} Transcript:\n{window_text}"

            section_analysis = self.llm_client.complete_json(
                system=MAP_SYSTEM_PROMPT,
                user=map_user_prompt,
                schema=SectionAnalysis,
            )
            section_results.append(section_analysis)

        # 2. Reduce Phase: merge and deduplicate
        compiled_sections = [s.model_dump() for s in section_results]
        reduce_user_prompt = (
            f"Meeting Date Reference: {meeting_date_str}\n\n"
            f"Intermediate Section Analyses:\n"
            f"{json.dumps(compiled_sections, indent=2)}\n\n"
            f"Please synthesize the final overall meeting analysis."
        )

        return self.llm_client.complete_json(
            system=REDUCE_SYSTEM_PROMPT,
            user=reduce_user_prompt,
            schema=MeetingAnalysis,
        )

    def save_analysis(
        self,
        db: Session,
        meeting: Meeting,
        analysis: MeetingAnalysis,
    ) -> None:
        """
        Persists LLM analysis results into summaries and action_items tables,
        and updates the meeting title if untouched by the user.
        """
        # 1. Save or update Summary
        summary_row = db.execute(
            select(Summary).where(Summary.meeting_id == meeting.id)
        ).scalar_one_or_none()

        llm_model_name = settings.LLM_MODEL if settings.LLM_PROVIDER != "fake" else "fake-claude"

        if not summary_row:
            summary_row = Summary(
                meeting_id=meeting.id,
                summary=analysis.summary,
                key_points=analysis.key_points,
                decisions=analysis.decisions,
                llm_model=llm_model_name,
            )
            db.add(summary_row)
        else:
            summary_row.summary = analysis.summary
            summary_row.key_points = analysis.key_points
            summary_row.decisions = analysis.decisions
            summary_row.llm_model = llm_model_name

        # 2. Save Action Items (purge existing AI action items for idempotency)
        db.execute(
            delete(ActionItem).where(
                ActionItem.meeting_id == meeting.id,
                ActionItem.created_by_ai.is_(True),
            )
        )

        for item in analysis.action_items:
            due_date_parsed: Optional[date] = None
            if item.due_date:
                try:
                    due_date_parsed = date.fromisoformat(item.due_date)
                except ValueError:
                    due_date_parsed = None

            action_row = ActionItem(
                id=uuid.uuid4(),
                meeting_id=meeting.id,
                user_id=meeting.user_id,
                description=item.description,
                owner=item.owner,
                due_date=due_date_parsed,
                priority=item.priority,
                status="open",
                source_start_sec=item.source_start_sec,
                created_by_ai=True,
            )
            db.add(action_row)

        # 3. Update title if untouched by user
        if not meeting.title_edited and analysis.suggested_title:
            meeting.title = analysis.suggested_title

        meeting.updated_at = datetime.now(timezone.utc)
        db.commit()
