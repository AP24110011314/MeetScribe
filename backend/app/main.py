"""FastAPI application factory."""

import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import APIError
from app.core.logging import setup_logging

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Build the ASGI app: logging, CORS, routers, health endpoint."""
    settings = get_settings()
    setup_logging()

    app = FastAPI(title="MeetScribe API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(APIError)
    async def _api_error_handler(_: Request, exc: APIError) -> JSONResponse:
        """Render APIError as `{detail, code}` per docs/API.md."""
        return JSONResponse(status_code=exc.status_code, content=exc.as_content())

    @app.exception_handler(Exception)
    async def _unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
        )

    app.include_router(api_router, prefix="/api/v1")

    @app.get("/healthz", tags=["system"])
    async def healthz() -> dict[str, str]:
        """Liveness probe: process is up and serving requests."""
        return {"status": "ok"}

    logger.info("MeetScribe API started", extra={"env": settings.env})
    return app


app = create_app()
