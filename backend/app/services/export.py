import io
from datetime import datetime, timezone
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.db.models import ActionItem, Meeting, Summary


def format_duration(seconds: Optional[float]) -> str:
    if not seconds or seconds <= 0:
        return "Unknown"
    mins, secs = divmod(int(seconds), 60)
    hours, mins = divmod(mins, 60)
    if hours > 0:
        return f"{hours}h {mins}m {secs}s"
    return f"{mins}m {secs}s"


def export_markdown(
    meeting: Meeting,
    summary: Optional[Summary],
    action_items: List[ActionItem],
) -> str:
    """
    Renders meeting notes, summary, decisions, and action items as Markdown.
    """
    date_str = (
        meeting.created_at.strftime("%Y-%m-%d %H:%M UTC")
        if meeting.created_at
        else datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    )
    duration_str = format_duration(meeting.duration_sec)

    lines = [
        f"# {meeting.title}",
        "",
        f"- **Date:** {date_str}",
        f"- **Duration:** {duration_str}",
        f"- **Language:** {meeting.language or 'en'}",
        "",
    ]

    if summary:
        lines.extend(
            [
                "## Executive Summary",
                "",
                summary.summary,
                "",
            ]
        )

        if summary.key_points:
            lines.extend(
                [
                    "## Key Discussion Points",
                    "",
                ]
            )
            for point in summary.key_points:
                lines.append(f"- {point}")
            lines.append("")

        if summary.decisions:
            lines.extend(
                [
                    "## Decisions",
                    "",
                ]
            )
            for decision in summary.decisions:
                lines.append(f"- {decision}")
            lines.append("")

    if action_items:
        lines.extend(
            [
                "## Action Items",
                "",
                "| Description | Owner | Due Date | Priority | Status |",
                "|---|---|---|---|---|",
            ]
        )
        for item in action_items:
            owner_str = item.owner or "Unassigned"
            due_str = item.due_date.isoformat() if item.due_date else "None"
            priority_str = item.priority.capitalize()
            status_str = item.status.replace("_", " ").capitalize()
            # Sanitize pipe symbols in description
            desc = item.description.replace("|", "/")
            lines.append(f"| {desc} | {owner_str} | {due_str} | {priority_str} | {status_str} |")
        lines.append("")

    return "\n".join(lines)


def export_pdf(
    meeting: Meeting,
    summary: Optional[Summary],
    action_items: List[ActionItem],
) -> bytes:
    """
    Renders meeting notes as a styled PDF using ReportLab.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=10,
    )
    heading2_style = ParagraphStyle(
        "DocH2",
        parent=styles["Heading2"],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#334155"),
        spaceBefore=14,
        spaceAfter=6,
    )
    meta_style = ParagraphStyle(
        "DocMeta",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=14,
    )
    body_style = ParagraphStyle(
        "DocBody",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
    )
    bullet_style = ParagraphStyle(
        "DocBullet",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        leftIndent=15,
        spaceAfter=4,
    )

    story = []

    # Title & Metadata
    story.append(Paragraph(meeting.title, title_style))
    date_str = (
        meeting.created_at.strftime("%B %d, %Y at %H:%M UTC")
        if meeting.created_at
        else datetime.now(timezone.utc).strftime("%B %d, %Y")
    )
    meta_text = f"Date: {date_str}  •  Duration: {format_duration(meeting.duration_sec)}  •  Language: {meeting.language or 'en'}"
    story.append(Paragraph(meta_text, meta_style))
    story.append(Spacer(1, 10))

    # Executive Summary
    if summary:
        story.append(Paragraph("Executive Summary", heading2_style))
        story.append(Paragraph(summary.summary, body_style))
        story.append(Spacer(1, 8))

        # Key Points
        if summary.key_points:
            story.append(Paragraph("Key Points", heading2_style))
            for kp in summary.key_points:
                story.append(Paragraph(f"• {kp}", bullet_style))
            story.append(Spacer(1, 8))

        # Decisions
        if summary.decisions:
            story.append(Paragraph("Decisions", heading2_style))
            for d in summary.decisions:
                story.append(Paragraph(f"• {d}", bullet_style))
            story.append(Spacer(1, 8))

    # Action Items Table
    if action_items:
        story.append(Paragraph("Action Items", heading2_style))
        table_data = [["Description", "Owner", "Due Date", "Priority", "Status"]]
        for item in action_items:
            owner_text = item.owner or "—"
            due_text = item.due_date.isoformat() if item.due_date else "—"
            table_data.append(
                [
                    Paragraph(item.description, body_style),
                    owner_text,
                    due_text,
                    item.priority.capitalize(),
                    item.status.replace("_", " ").capitalize(),
                ]
            )

        col_widths = [200, 75, 75, 60, 65]
        t = Table(table_data, colWidths=col_widths, repeatRows=1)
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(t)

    doc.build(story)
    return buffer.getvalue()
