import logging
from typing import Any

from celery import Celery
from celery.signals import worker_ready

from app.core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "meetscribe",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks", "app.workers.reaper"],
)

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_transport_options={"visibility_timeout": 7200},
    result_expires=7200,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "reap-stuck-jobs-every-minute": {
            "task": "app.workers.reaper.reap_stuck_jobs",
            "schedule": 60.0,
        },
    },
)

celery_app.autodiscover_tasks(["app.workers"])


@worker_ready.connect  # type: ignore[untyped-decorator]
def on_worker_ready(**kwargs: Any) -> None:
    logger.info(
        "Worker started. TRANSCRIBER=%s (model=%s), LLM_PROVIDER=%s (model=%s)",
        settings.TRANSCRIBER,
        settings.WHISPER_MODEL,
        settings.LLM_PROVIDER,
        settings.LLM_MODEL,
    )
    if settings.ENV != "test":
        if settings.TRANSCRIBER == "fake":
            raise RuntimeError(
                "Invalid configuration: TRANSCRIBER cannot be 'fake' outside ENV=test."
            )
        if settings.LLM_PROVIDER == "fake":
            raise RuntimeError(
                "Invalid configuration: LLM_PROVIDER cannot be 'fake' outside ENV=test. "
                "Please set LLM_PROVIDER=gemini and configure LLM_API_KEY in .env"
            )
        if settings.LLM_PROVIDER in ("gemini", "anthropic") and not settings.effective_llm_api_key:
            raise RuntimeError(
                f"Missing API key for LLM_PROVIDER={settings.LLM_PROVIDER}. "
                "Please configure LLM_API_KEY in .env"
            )
