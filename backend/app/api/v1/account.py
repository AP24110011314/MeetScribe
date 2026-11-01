import csv
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.models import ActionItem, Meeting, User
from app.db.session import get_db
from app.services.export import export_ics, export_json, export_markdown
from app.services.storage import get_storage_service

router = APIRouter(prefix="/account", tags=["Account"])


@router.get(
    "/export",
    summary="Export all user data as a ZIP archive (JSON, Markdown, CSV, ICS)",
)
async def export_all_user_data(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    # 1. Fetch all meetings with relations
    stmt = (
        select(Meeting)
        .where(Meeting.user_id == current_user.id)
        .options(
            selectinload(Meeting.summary),
            selectinload(Meeting.action_items),
            selectinload(Meeting.transcript),
        )
        .order_by(Meeting.created_at.desc())
    )
    res = await db.execute(stmt)
    meetings = res.scalars().all()

    # 2. Fetch all user action items
    ai_stmt = (
        select(ActionItem)
        .where(ActionItem.user_id == current_user.id)
        .order_by(ActionItem.created_at.desc())
    )
    ai_res = await db.execute(ai_stmt)
    all_action_items = ai_res.scalars().all()

    meeting_titles = {m.id: m.title for m in meetings}

    # 3. Build ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Export each meeting as JSON and Markdown
        for m in meetings:
            safe_title = re.sub(r"[^a-zA-Z0-9_-]", "_", m.title).strip("_") or "meeting"
            base_name = f"{safe_title}_{str(m.id)[:8]}"

            # Meeting JSON
            m_json = export_json(m, m.summary, m.action_items, m.transcript)
            zf.writestr(f"meetings/{base_name}.json", m_json)

            # Meeting Markdown
            m_md = export_markdown(m, m.summary, m.action_items, m.transcript)
            zf.writestr(f"meetings/{base_name}.md", m_md)

        # Action Items CSV
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(
            [
                "id",
                "meeting_id",
                "meeting_title",
                "description",
                "owner",
                "due_date",
                "priority",
                "status",
                "created_at",
            ]
        )
        for it in all_action_items:
            writer.writerow(
                [
                    str(it.id),
                    str(it.meeting_id),
                    meeting_titles.get(it.meeting_id, ""),
                    it.description,
                    it.owner or "",
                    it.due_date.isoformat() if it.due_date else "",
                    it.priority,
                    it.status,
                    it.created_at.isoformat() if it.created_at else "",
                ]
            )
        zf.writestr("action_items.csv", csv_buffer.getvalue())

        # Action Items ICS Calendar
        dummy_meeting = Meeting(
            title="MeetScribe Action Items", created_at=datetime.now(timezone.utc)
        )
        ics_text = export_ics(dummy_meeting, list(all_action_items))
        zf.writestr("action_items.ics", ics_text)

        # Export Manifest
        manifest = {
            "user_id": str(current_user.id),
            "email": current_user.email,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "total_meetings": len(meetings),
            "total_action_items": len(all_action_items),
        }
        zf.writestr("export_summary.json", json.dumps(manifest, indent=2))

    filename = f"meetscribe_export_{str(current_user.id)[:8]}.zip"
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete user account and cascade delete all data and audio storage",
)
async def delete_user_account(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    storage = get_storage_service()

    # 1. Fetch user meetings to clean up storage objects
    stmt = select(Meeting).where(Meeting.user_id == current_user.id)
    res = await db.execute(stmt)
    meetings = res.scalars().all()

    for m in meetings:
        if m.audio_key:
            try:
                storage.delete(m.audio_key)
            except Exception:
                pass
        if m.normalized_key:
            try:
                storage.delete(m.normalized_key)
            except Exception:
                pass
        try:
            storage.delete(f"uploads/{current_user.id}/{m.id}/")
        except Exception:
            pass

    # 2. Delete user row (cascades to meetings, summaries, action_items, notifications, etc.)
    await db.delete(current_user)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
