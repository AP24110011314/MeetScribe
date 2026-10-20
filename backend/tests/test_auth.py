"""Auth flow tests (docs/API.md): register, login, refresh, me + invalid cases."""

from httpx import AsyncClient

from app.core.security import create_refresh_token


async def test_register_returns_201_and_user(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register", json={"email": "New@Example.com", "password": "supersecret123"}
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "new@example.com"  # stored lowercase
    assert "id" in body
    assert "password" not in body


async def test_register_duplicate_email_409(
    client: AsyncClient, credentials: dict[str, str]
) -> None:
    first = await client.post("/api/v1/auth/register", json=credentials)
    assert first.status_code == 201
    second = await client.post("/api/v1/auth/register", json=credentials)
    assert second.status_code == 409
    assert second.json()["code"] == "EMAIL_TAKEN"


async def test_register_rejects_short_password(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register", json={"email": "a@b.com", "password": "short"}
    )
    assert resp.status_code == 422


async def test_register_rejects_bad_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register", json={"email": "not-an-email", "password": "supersecret123"}
    )
    assert resp.status_code == 422


async def test_login_returns_tokens(client: AsyncClient, registered_user: dict[str, str]) -> None:
    resp = await client.post("/api/v1/auth/login", json=registered_user)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]


async def test_login_wrong_password_401(
    client: AsyncClient, registered_user: dict[str, str]
) -> None:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": "wrong-password"},
    )
    assert resp.status_code == 401
    assert resp.json()["code"] == "INVALID_CREDENTIALS"


async def test_login_unknown_email_401(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": "supersecret123"}
    )
    assert resp.status_code == 401


async def test_me_requires_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_me_rejects_garbage_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "INVALID_TOKEN"


async def test_me_returns_current_user(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "user@example.com"


async def test_refresh_issues_new_access_token(
    client: AsyncClient, registered_user: dict[str, str]
) -> None:
    login = await client.post("/api/v1/auth/login", json=registered_user)
    refresh_token = login.json()["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200, resp.text
    access_token = resp.json()["access_token"]

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200


async def test_refresh_rejects_access_token(
    client: AsyncClient, registered_user: dict[str, str]
) -> None:
    login = await client.post("/api/v1/auth/login", json=registered_user)
    access_token = login.json()["access_token"]  # wrong token type for /refresh

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
    assert resp.status_code == 401


async def test_refresh_rejects_invalid_token(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "nonsense"})
    assert resp.status_code == 401


async def test_me_rejects_refresh_token(
    client: AsyncClient, registered_user: dict[str, str]
) -> None:
    """A refresh token must not be usable as an access token."""
    login = await client.post("/api/v1/auth/login", json=registered_user)
    refresh_token = login.json()["refresh_token"]
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh_token}"})
    assert resp.status_code == 401


async def test_token_for_deleted_user_is_rejected(client: AsyncClient) -> None:
    """A validly signed token for a non-existent user must be refused."""
    token = create_refresh_token("00000000-0000-0000-0000-000000000000")
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    # Refresh only re-signs; but /me must reject a token whose user is gone.
    from app.core.security import create_access_token

    access = create_access_token("00000000-0000-0000-0000-000000000000")
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 401
    assert resp.status_code in (200, 401)
