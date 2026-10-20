"""Error helpers so responses match API.md: `{"detail": ..., "code": ...}`."""

from typing import Any

from fastapi import HTTPException


class APIError(HTTPException):
    """HTTPException carrying a machine-readable `code` alongside `detail`."""

    def __init__(self, status_code: int, detail: str, code: str) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code

    def as_content(self) -> dict[str, Any]:
        return {"detail": self.detail, "code": self.code}
