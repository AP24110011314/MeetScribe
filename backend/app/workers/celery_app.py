from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "meetscribe",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    result_expires=7200,
    broker_connection_retry_on_startup=True,
    beat_schedule={},
)
