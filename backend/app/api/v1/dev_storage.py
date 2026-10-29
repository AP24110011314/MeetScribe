import re
from typing import Generator

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.services.storage import LocalStorageService

router = APIRouter(prefix="/dev-storage", tags=["DevStorage"])


def get_local_storage() -> LocalStorageService:
    if settings.STORAGE_BACKEND != "local":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dev storage is only available when STORAGE_BACKEND=local",
        )
    return LocalStorageService()


@router.put("/upload/{token}", summary="Dev-only raw file upload via signed token")
async def dev_storage_upload(token: str, request: Request) -> dict[str, str]:
    storage = get_local_storage()
    try:
        data = storage.verify_token(token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )

    if data.get("action") != "upload":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token action for upload",
        )

    key = data.get("key")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid key in token",
        )

    target_file = storage.base_dir / key
    target_file.parent.mkdir(parents=True, exist_ok=True)

    # Stream body to file
    with open(target_file, "wb") as f:
        async for chunk in request.stream():
            f.write(chunk)

    return {"status": "ok"}


@router.get("/download/{token}", summary="Dev-only file download with HTTP Range support")
async def dev_storage_download(token: str, request: Request) -> Response:
    storage = get_local_storage()
    try:
        data = storage.verify_token(token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )

    if data.get("action") != "download":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token action for download",
        )

    key = data.get("key")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid key in token",
        )

    target_file = storage.base_dir / key
    if not target_file.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found in storage",
        )

    file_size = target_file.stat().st_size
    range_header = request.headers.get("Range")

    if not range_header:
        # Full file content
        def file_iterator() -> Generator[bytes, None, None]:
            with open(target_file, "rb") as f:
                while chunk := f.read(64 * 1024):
                    yield chunk

        headers = {
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
        }
        return StreamingResponse(
            file_iterator(), status_code=200, headers=headers, media_type="application/octet-stream"
        )

    # Range request support (RFC 7233)
    range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
    if not range_match:
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail="Invalid Range header format",
        )

    start = int(range_match.group(1))
    end_str = range_match.group(2)
    end = int(end_str) if end_str else file_size - 1

    if start >= file_size or end >= file_size or start > end:
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    content_length = end - start + 1

    def range_iterator(start_pos: int, bytes_to_read: int) -> Generator[bytes, None, None]:
        with open(target_file, "rb") as f:
            f.seek(start_pos)
            remaining = bytes_to_read
            while remaining > 0:
                chunk_size = min(64 * 1024, remaining)
                data = f.read(chunk_size)
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(content_length),
        "Accept-Ranges": "bytes",
    }
    return StreamingResponse(
        range_iterator(start, content_length),
        status_code=206,
        headers=headers,
        media_type="application/octet-stream",
    )
