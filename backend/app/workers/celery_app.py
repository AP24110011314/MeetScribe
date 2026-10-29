from celery import Celery

from app.core.config import settings

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
