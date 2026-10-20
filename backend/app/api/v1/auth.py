"""Auth endpoints (docs/API.md). Thin: all rules live in `app.services.auth`."""

import jwt
from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.core.errors import APIError
from app.core.security import create_access_token, decode_token
from app.schemas.auth import (
    AccessTokenResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def register(payload: RegisterRequest, session: DbSession) -> UserResponse:
    user = await auth_service.register_user(session, payload.email, payload.password)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: DbSession) -> TokenResponse:
    user = await auth_service.authenticate(session, payload.email, payload.password)
    access_token, refresh_token = auth_service.issue_tokens(user)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(payload: RefreshRequest) -> AccessTokenResponse:
    try:
        user_id = decode_token(payload.refresh_token, "refresh")
    except jwt.PyJWTError as exc:
        raise APIError(401, "Invalid or expired refresh token", "INVALID_TOKEN") from exc
    return AccessTokenResponse(access_token=create_access_token(user_id))


@router.get("/me", response_model=UserResponse)
async def me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)
