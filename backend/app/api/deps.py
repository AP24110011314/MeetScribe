"""Shared FastAPI dependencies: DB session, current user, ownership checks."""

from collections.abc import AsyncIterator
from typing import Annotated

import jwt
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.core.security import decode_token
from app.db.models import User
from app.db.session import get_session
from app.services.auth import get_user_by_id
from app.services.storage import StorageService, get_storage_service


async def get_db() -> AsyncIterator[AsyncSession]:
    """Request-scoped database session."""
    async for session in get_session():
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    session: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the authenticated user from the `Authorization: Bearer <token>` header."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise APIError(401, "Not authenticated", "NOT_AUTHENTICATED")
    token = authorization.split(" ", 1)[1].strip()
    try:
        user_id = decode_token(token, "access")
    except jwt.PyJWTError as exc:
        raise APIError(401, "Invalid or expired token", "INVALID_TOKEN") from exc

    user = await get_user_by_id(session, user_id)
    if user is None:
        raise APIError(401, "User no longer exists", "INVALID_TOKEN")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_storage() -> StorageService:
    """Storage dependency; overridden with a fake in tests."""
    return get_storage_service()


Storage = Annotated[StorageService, Depends(get_storage)]
