from unittest.mock import patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_readyz_healthy(client: AsyncClient):
    res = await client.get("/readyz")
    assert res.status_code == 200
    data = res.json()
    assert data["db"] == "ok"
    assert data["redis"] == "ok"
    assert data["storage"] == "ok"


@pytest.mark.asyncio
async def test_readyz_db_failure(client: AsyncClient):
    with patch(
        "sqlalchemy.ext.asyncio.AsyncEngine.connect", side_effect=RuntimeError("DB disconnected")
    ):
        res = await client.get("/readyz")
        assert res.status_code == 503
        data = res.json()
        assert data["db"] == "fail"


@pytest.mark.asyncio
async def test_readyz_redis_failure(client: AsyncClient):
    with patch("redis.asyncio.from_url") as mock_redis:
        mock_r = mock_redis.return_value
        mock_r.ping.side_effect = RuntimeError("Redis down")
        res = await client.get("/readyz")
        assert res.status_code == 503
        data = res.json()
        assert data["redis"] == "fail"


@pytest.mark.asyncio
async def test_readyz_storage_failure(client: AsyncClient):
    with patch(
        "app.services.storage.get_storage_service", side_effect=RuntimeError("Storage unavailable")
    ):
        res = await client.get("/readyz")
        assert res.status_code == 503
        data = res.json()
        assert data["storage"] == "fail"
