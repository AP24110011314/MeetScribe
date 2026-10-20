"""Ownership dependency: a user may only access their own meetings (AGENTS.md rule 8)."""

import uuid
from typing import Annotated

from fastapi import Depends

from app.api.deps import CurrentUser, DbSession
from app.core.errors import APIError
from app.db.models import Meeting


async def get_owned_meeting(
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbSession,
) -> Meeting:
    """Fetch a meeting owned by the current user, else 404 (never leak existence)."""
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None or meeting.user_id != current_user.id:
        raise APIError(404, "Meeting not found", "MEETING_NOT_FOUND")
    return meeting


OwnedMeeting = Annotated[Meeting, Depends(get_owned_meeting)]
