"""FastAPI application factory."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
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
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/healthz", tags=["system"])
    async def healthz() -> dict[str, str]:
        """Liveness probe: process is up and serving requests."""
        return {"status": "ok"}

    logger.info("MeetScribe API started", extra={"env": settings.env})
    return app


app = create_app()
