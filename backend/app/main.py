from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.api.v1 import api_router
from app.core.config import settings
from app.core.rate_limit import limiter

app = FastAPI(
    title="MeetScribe API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Register slowapi rate limiter state
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Please try again later.",
            "code": "RATE_LIMIT_EXCEEDED",
        },
    )


origins = (
    settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# System health & readiness endpoints
@app.get("/healthz", tags=["System"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", tags=["System"])
async def readyz() -> JSONResponse:
    checks = {"db": "fail", "redis": "fail", "storage": "fail"}

    # 1. Database check
    try:
        from sqlalchemy import text

        from app.db.session import async_engine

        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        pass

    # 2. Redis check
    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL)  # type: ignore[no-untyped-call]
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception:
        pass

    # 3. Storage check
    try:
        from app.services.storage import LocalStorageService, S3StorageService, get_storage_service

        storage = get_storage_service()
        if isinstance(storage, S3StorageService):
            # Test connectivity to S3 / MinIO
            storage.client.head_bucket(Bucket=settings.S3_BUCKET)
        elif isinstance(storage, LocalStorageService):
            if not storage.base_dir.exists():
                raise FileNotFoundError("Local storage directory missing")
        checks["storage"] = "ok"
    except Exception:
        pass

    is_ready = all(v == "ok" for v in checks.values())
    status_code = 200 if is_ready else 503
    return JSONResponse(
        status_code=status_code,
        content=checks,
    )


# API Router
app.include_router(api_router)
