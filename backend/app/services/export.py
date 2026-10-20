"""Export meeting notes as Markdown and PDF (Phase 7)."""

from __future__ import annotations

import io
from datetime import date

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.db.models import ActionItem, Meeting, Summary, Transcript


def render_markdown(
    meeting: Meeting,
    summary: Summary | None,
    action_items: list[ActionItem],
    transcript: Transcript | None,
) -> str:
    lines: list[str] = []
    title = meeting.title or meeting.original_filename
    lines.append(f"# {title}")
    lines.append("")
    if meeting.duration_sec is not None:
        lines.append(f"- Duration: {meeting.duration_sec:.1f}s")
    if meeting.language:
        lines.append(f"- Language: {meeting.language}")
    lines.append("")

    if summary is not None:
        lines.append("## Summary")
        lines.append("")
        lines.append(summary.summary)
        lines.append("")
        if summary.key_points:
            lines.append("## Key points")
            lines.append("")
            for kp in summary.key_points:
                lines.append(f"- {kp}")
            lines.append("")
        if summary.decisions:
            lines.append("## Decisions")
            lines.append("")
            for d in summary.decisions:
                lines.append(f"- {d}")
            lines.append("")
    else:
        lines.append("## Summary")
        lines.append("")
        lines.append("_No summary yet._")
        lines.append("")

    lines.append("## Action items")
    lines.append("")
    if not action_items:
        lines.append("_No action items._")
        lines.append("")
    else:
        for item in action_items:
            due = item.due_date.isoformat() if isinstance(item.due_date, date) else ""
            owner = item.owner or "—"
            lines.append(
                f"- [ ] {item.description} (owner: {owner}, due: {due or '—'}, priority: {item.priority.value}, status: {item.status.value})"
            )
        lines.append("")

    if transcript is not None and transcript.segments:
        lines.append("## Transcript")
        lines.append("")
        for seg in transcript.segments:
            start = seg.get("start", 0)
            try:
                secs = int(float(start))  # type: ignore[arg-type]
                m, s_rem = divmod(secs, 60)
                h, m_rem = divmod(m, 60)
                ts = f"{h:02d}:{m_rem:02d}:{s_rem:02d}"
            except Exception:
                ts = "00:00:00"
            lines.append(f"- [{ts}] {seg.get('text', '')}")
        lines.append("")

    return "\n".join(lines)


def render_pdf(
    meeting: Meeting,
    summary: Summary | None,
    action_items: list[ActionItem],
    transcript: Transcript | None,
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    width, height = letter
    y = height - 50
    title = meeting.title or meeting.original_filename
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y, title)
    y -= 30
    c.setFont("Helvetica", 10)
    if summary is not None:
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "Summary")
        y -= 18
        c.setFont("Helvetica", 9)
        for line in _wrap(summary.summary, 90):
            if y < 60:
                c.showPage()
                y = height - 50
            c.drawString(50, y, line)
            y -= 12
        y -= 10
    if action_items:
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "Action items")
        y -= 18
        c.setFont("Helvetica", 9)
        for item in action_items:
            due = item.due_date.isoformat() if isinstance(item.due_date, date) else "—"
            owner = item.owner or "—"
            text = f"- {item.description} (owner: {owner}, due: {due}, priority: {item.priority.value})"
            for line in _wrap(text, 90):
                if y < 60:
                    c.showPage()
                    y = height - 50
                c.drawString(50, y, line)
                y -= 12
        y -= 10
    c.save()
    return buf.getvalue()


def _wrap(text: str, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur: list[str] = []
    for w in words:
        if cur and (sum(len(x) for x in cur) + len(cur) + len(w) > width):
            lines.append(" ".join(cur))
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(" ".join(cur))
    return lines
