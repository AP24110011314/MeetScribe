"""Simple in-memory rate limiting for auth endpoints (Phase 8)."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self, requests: int, window_seconds: int) -> None:
        self.requests = requests
        self.window_seconds = window_seconds
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)

    def _key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    def limit(self, request: Request) -> None:
        now = time.monotonic()
        key = self._key(request)
        bucket = self._hits[key]
        while bucket and now - bucket[0] >= self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests",
                headers={"Retry-After": str(self.window_seconds)},
            )
        bucket.append(now)


login_limiter = RateLimiter(requests=5, window_seconds=60)
register_limiter = RateLimiter(requests=3, window_seconds=60)


def check_login(request: Request) -> None:
    login_limiter.limit(request)


def check_register(request: Request) -> None:
    register_limiter.limit(request)
