import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.asyncio
async def test_healthz_endpoint(client):
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_settings_rejects_forbidden_port():
    # macOS AirPlay Receiver port must be rejected
    forbidden_port = 5 * 1000
    with pytest.raises(ValidationError) as exc_info:
        Settings(API_PORT=forbidden_port)
    assert f"Port {forbidden_port} is reserved by macOS for AirPlay Receiver" in str(exc_info.value)


def test_settings_accepts_port_8000():
    s = Settings(API_PORT=8000)
    assert s.API_PORT == 8000
