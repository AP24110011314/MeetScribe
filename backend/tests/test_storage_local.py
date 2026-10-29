import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.services.storage import LocalStorageService


def test_local_storage_token_roundtrip(tmp_path):
    storage = LocalStorageService()
    storage.base_dir = tmp_path

    token = storage.generate_token(key="test/audio.mp3", action="upload")
    payload = storage.verify_token(token)
    assert payload["key"] == "test/audio.mp3"
    assert payload["action"] == "upload"


def test_local_storage_token_expired(tmp_path):
    storage = LocalStorageService()
    storage.base_dir = tmp_path

    token = storage.generate_token(key="test/audio.mp3", action="upload")
    with pytest.raises(ValueError, match="Token has expired"):
        storage.verify_token(token, max_age=-1)


def test_local_storage_token_tampered(tmp_path):
    storage = LocalStorageService()
    storage.base_dir = tmp_path

    token = storage.generate_token(key="test/audio.mp3", action="upload")
    tampered_token = token[:-4] + "abcd"
    with pytest.raises(ValueError, match="Invalid or tampered token"):
        storage.verify_token(tampered_token)


@pytest.mark.asyncio
async def test_dev_storage_upload_and_download(client: AsyncClient, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "LOCAL_STORAGE_DIR", str(tmp_path))

    storage = LocalStorageService()
    key = "uploads/user-1/meeting-1/test.wav"
    upload_url, headers = storage.presign_upload(
        key=key, content_type="audio/wav", max_size_bytes=1000
    )

    # Extract path from URL (strip http://127.0.0.1:8000)
    upload_path = upload_url.replace(f"http://127.0.0.1:{settings.API_PORT}", "")

    # PUT raw audio content
    raw_content = b"RIFF" + b"\x00" * 96  # 100 bytes of dummy wav
    put_res = await client.put(upload_path, content=raw_content, headers=headers)
    assert put_res.status_code == 200
    assert put_res.json() == {"status": "ok"}

    # Verify file was written to disk
    target_path = tmp_path / key
    assert target_path.is_file()
    assert target_path.read_bytes() == raw_content
    assert storage.exists(key) is True

    # Download file without Range header
    download_url = storage.presign_download(key=key)
    download_path = download_url.replace(f"http://127.0.0.1:{settings.API_PORT}", "")

    get_res = await client.get(download_path)
    assert get_res.status_code == 200
    assert get_res.content == raw_content
    assert get_res.headers.get("Accept-Ranges") == "bytes"
    assert get_res.headers.get("Content-Length") == "100"


@pytest.mark.asyncio
async def test_dev_storage_download_range_requests(client: AsyncClient, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "LOCAL_STORAGE_DIR", str(tmp_path))

    storage = LocalStorageService()
    key = "test_range.bin"
    raw_content = bytes(range(100))  # 100 bytes from 0 to 99

    target_file = tmp_path / key
    target_file.write_bytes(raw_content)

    download_url = storage.presign_download(key=key)
    download_path = download_url.replace(f"http://127.0.0.1:{settings.API_PORT}", "")

    # Range bytes=0-9 (first 10 bytes)
    res_range1 = await client.get(download_path, headers={"Range": "bytes=0-9"})
    assert res_range1.status_code == 206
    assert res_range1.content == raw_content[0:10]
    assert res_range1.headers.get("Content-Range") == "bytes 0-9/100"
    assert res_range1.headers.get("Content-Length") == "10"

    # Range bytes=10-19
    res_range2 = await client.get(download_path, headers={"Range": "bytes=10-19"})
    assert res_range2.status_code == 206
    assert res_range2.content == raw_content[10:20]
    assert res_range2.headers.get("Content-Range") == "bytes 10-19/100"
    assert res_range2.headers.get("Content-Length") == "10"

    # Range bytes=50- (from 50 to end)
    res_range3 = await client.get(download_path, headers={"Range": "bytes=50-"})
    assert res_range3.status_code == 206
    assert res_range3.content == raw_content[50:100]
    assert res_range3.headers.get("Content-Range") == "bytes 50-99/100"
    assert res_range3.headers.get("Content-Length") == "50"

    # Invalid range (out of bounds)
    res_range_out = await client.get(download_path, headers={"Range": "bytes=200-250"})
    assert res_range_out.status_code == 416


@pytest.mark.asyncio
async def test_dev_storage_token_validation_errors(client: AsyncClient, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "LOCAL_STORAGE_DIR", str(tmp_path))

    # Invalid token
    res_invalid = await client.put("/api/v1/dev-storage/upload/bad-token", content=b"data")
    assert res_invalid.status_code == 401

    # Action mismatch: using download token for upload
    storage = LocalStorageService()
    download_token = storage.generate_token(key="some/key.mp3", action="download")
    res_mismatch = await client.put(f"/api/v1/dev-storage/upload/{download_token}", content=b"data")
    assert res_mismatch.status_code == 400
    assert "Invalid token action" in res_mismatch.json()["detail"]


@pytest.mark.asyncio
async def test_dev_storage_disabled_in_s3_mode(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")

    res = await client.put("/api/v1/dev-storage/upload/any-token", content=b"data")
    assert res.status_code == 404
    assert "Dev storage is only available when STORAGE_BACKEND=local" in res.json()["detail"]
