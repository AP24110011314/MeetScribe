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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# System health endpoint
@app.get("/healthz", tags=["System"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


# API Router
app.include_router(api_router)
