#!/usr/bin/env bash
# Free-Tier All-in-One Startup Script for Render Web Service
# Runs Celery Worker + Beat in background, and Uvicorn Web Server in foreground.
# No paid Render Background Worker required!
set -e

export PATH="$HOME/bin:$PATH"
cd backend

start_celery() {
  while true; do
    echo "==> Starting Celery Worker + Beat Scheduler in background..."
    celery -A app.workers.celery_app worker --beat --loglevel=info --pool=solo || true
    echo "==> Celery stopped. Restarting in 3 seconds..."
    sleep 3
  done
}

start_celery &
CELERY_PID=$!

# Forward shutdown signals cleanly
trap "echo '==> Shutting down Celery...'; kill -TERM $CELERY_PID 2>/dev/null || true; exit" SIGTERM SIGINT

echo "==> Starting Uvicorn Web Server on port ${PORT:-8000}..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

