import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_owned_meeting
from app.core.security import hash_password, verify_password
from app.db.models import Meeting, ShareLink, User
from app.db.session import get_db
from app.schemas.sharing import (
    PublicActionItem,
    PublicShareResponse,
    PublicShareUnlockRequest,
    PublicSummary,
    PublicTranscript,
    PublicTranscriptSegment,
    ShareLinkCreateRequest,
    ShareLinkResponse,
)

router = APIRouter(tags=["Share"])


def build_public_response(meeting: Meeting, hide_transcript: bool) -> PublicShareResponse:
    summary_resp = None
    if meeting.summary:
        summary_resp = PublicSummary(
            summary=meeting.summary.summary,
            key_points=meeting.summary.key_points or [],
            decisions=meeting.summary.decisions or [],
        )

    action_items_resp = [
        PublicActionItem(
            id=item.id,
            description=item.description,
            owner=item.owner,
            due_date=item.due_date,
            priority=item.priority,
            status=item.status,
        )
        for item in (meeting.action_items or [])
    ]

    transcript_resp = None
    if not hide_transcript and meeting.transcript:
        segments = [
            PublicTranscriptSegment(
                id=s["id"],
                start=s["start"],
                end=s["end"],
                text=s["text"],
            )
            for s in (meeting.transcript.segments or [])
        ]
        transcript_resp = PublicTranscript(
            full_text=meeting.transcript.full_text,
            segments=segments,
        )

    return PublicShareResponse(
        title=meeting.title,
        created_at=meeting.created_at,
        duration_sec=meeting.duration_sec,
        language=meeting.language,
        summary=summary_resp,
        action_items=action_items_resp,
        transcript=transcript_resp,
        hide_transcript=hide_transcript,
    )


@router.post(
    "/meetings/{meeting_id}/share",
    response_model=ShareLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a public share link for a meeting",
)
async def create_share_link(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    data: ShareLinkCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ShareLinkResponse:
    token = secrets.token_hex(32)
    pwd_hash = hash_password(data.password) if data.password else None

    expires_at = None
    if data.expires_in_days and data.expires_in_days > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)

    share_link = ShareLink(
        id=uuid.uuid4(),
        meeting_id=meeting.id,
        user_id=current_user.id,
        token_hash=token,
        password_hash=pwd_hash,
        expires_at=expires_at,
        hide_transcript=data.hide_transcript,
        is_revoked=False,
        view_count=0,
    )
    db.add(share_link)
    await db.commit()
    await db.refresh(share_link)

    return ShareLinkResponse(
        id=share_link.id,
        meeting_id=share_link.meeting_id,
        token=token,
        share_url=f"/share/{token}",
        has_password=bool(pwd_hash),
        expires_at=share_link.expires_at,
        hide_transcript=share_link.hide_transcript,
        view_count=share_link.view_count,
        is_revoked=share_link.is_revoked,
        created_at=share_link.created_at,
    )


@router.get(
    "/meetings/{meeting_id}/share",
    response_model=List[ShareLinkResponse],
    summary="List active share links for a meeting",
)
async def list_share_links(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> List[ShareLinkResponse]:
    stmt = (
        select(ShareLink)
        .where(
            ShareLink.meeting_id == meeting.id,
            ShareLink.is_revoked.is_(False),
        )
        .order_by(ShareLink.created_at.desc())
    )
    res = await db.execute(stmt)
    links = res.scalars().all()

    return [
        ShareLinkResponse(
            id=sl.id,
            meeting_id=sl.meeting_id,
            token=sl.token_hash,
            share_url=f"/share/{sl.token_hash}",
            has_password=bool(sl.password_hash),
            expires_at=sl.expires_at,
            hide_transcript=sl.hide_transcript,
            view_count=sl.view_count,
            is_revoked=sl.is_revoked,
            created_at=sl.created_at,
        )
        for sl in links
    ]


@router.delete(
    "/meetings/{meeting_id}/share/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a share link",
)
async def revoke_share_link(
    meeting: Annotated[Meeting, Depends(get_owned_meeting)],
    link_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    stmt = select(ShareLink).where(
        ShareLink.id == link_id,
        ShareLink.meeting_id == meeting.id,
    )
    res = await db.execute(stmt)
    link = res.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    link.is_revoked = True
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/share/{token}",
    response_model=PublicShareResponse,
    summary="View public meeting notes without authentication",
)
async def get_public_meeting_notes(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicShareResponse:
    stmt = select(ShareLink).where(ShareLink.token_hash == token)
    res = await db.execute(stmt)
    link = res.scalar_one_or_none()

    if not link or link.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found or has been revoked",
        )

    if link.expires_at and link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This share link has expired",
        )

    meeting_stmt = (
        select(Meeting)
        .where(Meeting.id == link.meeting_id, Meeting.deleted_at.is_(None))
        .options(
            selectinload(Meeting.summary),
            selectinload(Meeting.action_items),
            selectinload(Meeting.transcript),
        )
    )
    m_res = await db.execute(meeting_stmt)
    meeting = m_res.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    if link.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "requires_password": True,
                "message": "Password required to view this meeting note",
                "title": meeting.title,
            },
        )

    link.view_count += 1
    await db.commit()

    return build_public_response(meeting, link.hide_transcript)


@router.post(
    "/share/{token}/unlock",
    response_model=PublicShareResponse,
    summary="Unlock password-protected meeting notes",
)
async def unlock_public_meeting_notes(
    token: str,
    data: PublicShareUnlockRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PublicShareResponse:
    stmt = select(ShareLink).where(ShareLink.token_hash == token)
    res = await db.execute(stmt)
    link = res.scalar_one_or_none()

    if not link or link.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found or has been revoked",
        )

    if link.expires_at and link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This share link has expired",
        )

    if link.password_hash and not verify_password(data.password, link.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    meeting_stmt = (
        select(Meeting)
        .where(Meeting.id == link.meeting_id, Meeting.deleted_at.is_(None))
        .options(
            selectinload(Meeting.summary),
            selectinload(Meeting.action_items),
            selectinload(Meeting.transcript),
        )
    )
    m_res = await db.execute(meeting_stmt)
    meeting = m_res.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    link.view_count += 1
    await db.commit()

    return build_public_response(meeting, link.hide_transcript)
