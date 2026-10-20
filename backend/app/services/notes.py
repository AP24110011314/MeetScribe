"""Persist LLM analysis into `summaries` and `action_items` (docs/DATABASE.md).

Idempotent by meeting: re-running the analyze stage replaces the summary and the
AI-created action items instead of duplicating them (D41). Manual action items
(`created_by_ai = false`) are preserved when the pipeline re-runs.
"""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ActionItem, Meeting, Summary
from app.schemas.analysis import MeetingAnalysis


async def save_analysis(
    session: AsyncSession,
    meeting: Meeting,
    analysis: MeetingAnalysis,
    *,
    llm_model: str,
    replace_title: bool = True,
) -> Summary:
    """Upsert the meeting's summary and replace its AI action items.

    Returns the persisted `Summary`. `meeting.title` is replaced by `suggested_title`
    when one was produced and the current title is still the original filename
    (docs/DATABASE.md: "defaults to filename, replaced by suggested title").
    """
    summary = await _upsert_summary(session, meeting.id, analysis, llm_model)
    await _replace_ai_action_items(session, meeting.id, analysis)

    if replace_title and analysis.suggested_title.strip():
        meeting.title = analysis.suggested_title.strip()

    await session.flush()
    return summary


async def _upsert_summary(
    session: AsyncSession,
    meeting_id: uuid.UUID,
    analysis: MeetingAnalysis,
    llm_model: str,
) -> Summary:
    summary = await session.get(Summary, meeting_id)
    if summary is None:
        summary = Summary(
            meeting_id=meeting_id,
            summary=analysis.summary,
            key_points=list(analysis.key_points),
            decisions=list(analysis.decisions),
            llm_model=llm_model,
        )
        session.add(summary)
    else:
        summary.summary = analysis.summary
        summary.key_points = list(analysis.key_points)
        summary.decisions = list(analysis.decisions)
        summary.llm_model = llm_model
    return summary


async def _replace_ai_action_items(
    session: AsyncSession,
    meeting_id: uuid.UUID,
    analysis: MeetingAnalysis,
) -> None:
    """Delete existing AI action items for the meeting and insert the new drafts."""
    await session.execute(
        delete(ActionItem).where(
            ActionItem.meeting_id == meeting_id,
            ActionItem.created_by_ai.is_(True),
        )
    )
    for draft in analysis.action_items:
        session.add(
            ActionItem(
                meeting_id=meeting_id,
                description=draft.description.strip(),
                owner=draft.owner,
                due_date=draft.due_date,
                priority=draft.priority,
                source_start_sec=draft.source_start_sec,
                created_by_ai=True,
            )
        )
    await session.flush()


async def list_action_items(session: AsyncSession, meeting_id: uuid.UUID) -> list[ActionItem]:
    """All action items for a meeting, oldest first (used by the detail endpoint)."""
    stmt = (
        select(ActionItem)
        .where(ActionItem.meeting_id == meeting_id)
        .order_by(ActionItem.created_at.asc())
    )
    return list((await session.execute(stmt)).scalars().all())


async def get_summary(session: AsyncSession, meeting_id: uuid.UUID) -> Summary | None:
    """Return the meeting's summary row, if analysis has completed."""
    return await session.get(Summary, meeting_id)
