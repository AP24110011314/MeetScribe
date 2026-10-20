"""Auth business logic. Routers stay thin; this module owns the rules."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.db.models import User


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: str) -> User | None:
    result = await session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def register_user(session: AsyncSession, email: str, password: str) -> User:
    """Create a user. Raises 409 when the email is already taken."""
    normalized = email.lower()
    if await get_user_by_email(session, normalized) is not None:
        raise APIError(409, "Email is already registered", "EMAIL_TAKEN")

    user = User(email=normalized, password_hash=hash_password(password))
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:  # concurrent registration race
        await session.rollback()
        raise APIError(409, "Email is already registered", "EMAIL_TAKEN") from exc
    await session.refresh(user)
    return user


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    """Verify credentials. Raises 401 without leaking which field was wrong."""
    user = await get_user_by_email(session, email)
    if user is None or not verify_password(password, user.password_hash):
        raise APIError(401, "Invalid email or password", "INVALID_CREDENTIALS")
    return user


def issue_tokens(user: User) -> tuple[str, str]:
    """Return (access_token, refresh_token) for a user."""
    subject = str(user.id)
    return create_access_token(subject), create_refresh_token(subject)
