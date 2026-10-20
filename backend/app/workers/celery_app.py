"""Celery application (broker/result: Redis). Tasks register in `app.workers.tasks`."""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("meetscribe", broker=settings.redis_url, backend=settings.redis_url)

# Reliability defaults per ARCHITECTURE.md; per-task retry policy set on each task.
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    task_time_limit=60 * 60,
    result_expires=86_400,
    worker_prefetch_multiplier=1,  # one in-flight task per child: fair + crash-safe
    timezone="UTC",
    enable_utc=True,
)
