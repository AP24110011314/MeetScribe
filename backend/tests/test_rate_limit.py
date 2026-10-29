import pytest
from httpx import AsyncClient

from app.core.rate_limit import limiter


@pytest.mark.asyncio
async def test_rate_limit_exceeded(client: AsyncClient):
    # Reset limiter storage before test
    limiter.reset()

    # Make 10 requests to rate-limited /login endpoint
    for i in range(10):
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": "ratelimit@example.com", "password": "wrongpassword"},
        )
        assert res.status_code == 401

    # 11th request should exceed 10/minute rate limit and return 429
    res_11 = await client.post(
        "/api/v1/auth/login",
        json={"email": "ratelimit@example.com", "password": "wrongpassword"},
    )
    assert res_11.status_code == 429
    data = res_11.json()
    assert data["code"] == "RATE_LIMIT_EXCEEDED"
    assert "rate limit exceeded" in data["detail"].lower()

    # Reset limiter after test to avoid affecting other tests
    limiter.reset()
