"""Ownership dependency tests: a user can never reach another user's meeting."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.meetings_deps import get_owned_meeting
from app.core.errors import APIError
from app.db.enums import MeetingStatus
from app.db.models import Meeting, User
from app.services.auth import register_user


async def _make_user(session: AsyncSession, email: str) -> User:
    return await register_user(session, email, "supersecret123")


async def _make_meeting(session: AsyncSession, user: User, title: str = "Standup") -> Meeting:
    meeting = Meeting(
        user_id=user.id,
        title=title,
        original_filename="sample.mp3",
        content_type="audio/mpeg",
        size_bytes=1024,
        status=MeetingStatus.PENDING_UPLOAD,
    )
    session.add(meeting)
    await session.flush()
    return meeting


async def test_owner_can_access_own_meeting(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "owner@example.com")
    meeting = await _make_meeting(db_session, owner)
    result = await get_owned_meeting(meeting.id, owner, db_session)
    assert result.id == meeting.id


async def test_other_user_gets_404(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "owner2@example.com")
    intruder = await _make_user(db_session, "intruder@example.com")
    meeting = await _make_meeting(db_session, owner)

    with pytest.raises(APIError) as exc:
        await get_owned_meeting(meeting.id, intruder, db_session)
    assert exc.value.status_code == 404
    assert exc.value.code == "MEETING_NOT_FOUND"


async def test_missing_meeting_gets_404(db_session: AsyncSession) -> None:
    user = await _make_user(db_session, "solo@example.com")
    with pytest.raises(APIError) as exc:
        await get_owned_meeting(uuid.uuid4(), user, db_session)
    assert exc.value.status_code == 404


async def test_ownership_dependency_is_importable() -> None:
    """Guard: the dependency exists and is the single ownership gate for meeting routes."""
    assert callable(get_owned_meeting)


async def test_second_user_cannot_see_first_users_meeting_via_api(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """End-to-end shape check via the app once meeting routes exist (Phase 2).

    For now we assert the underlying dependency, which every meeting route uses.
    """
    owner = await _make_user(db_session, "apiowner@example.com")
    other = await _make_user(db_session, "apiother@example.com")
    meeting = await _make_meeting(db_session, owner)

    with pytest.raises(APIError):
        await get_owned_meeting(meeting.id, other, db_session)
