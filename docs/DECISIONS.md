# Architectural & Implementation Decisions — MeetScribe

This file records non-obvious technical decisions, assumptions, and rationales throughout the implementation.

## Phase 0: Scaffold and Environment
1. **Port 5000 Guard & Validation**:
   - macOS AirPlay Receiver defaults to listening on port 5000.
   - Guarded in `app.core.config.Settings` (raises `ValueError` if `API_PORT == 5000`), in `scripts/check_env.py` (fails with diagnostic message), and guarded via Makefile/grep checks.
2. **Missing `docs/DATABASE.md` & `docs/PROMPTS.md` Formalization**:
   - `docs/DATABASE.md` was created to specify the schema for `users`, `meetings`, `transcripts`, `summaries`, `action_items`, and `jobs`.
   - `docs/PROMPTS.md` was created to document the LLM JSON prompt contracts for single-pass analysis, map-reduce, and validation retries.
3. **Database Drivers**:
   - API endpoints use asynchronous SQLAlchemy with `postgresql+asyncpg://`.
   - Celery background workers and Alembic migrations use synchronous SQLAlchemy with `postgresql+psycopg://` to avoid event-loop conflicts inside Celery's worker processes.
4. **Celery Worker Pool**:
   - macOS requires `--pool=solo` because native libraries (`faster-whisper`, CoreFoundation, etc.) can crash under Python's default fork prefork model on macOS.
5. **Local Storage Fallback vs S3**:
   - When `STORAGE_BACKEND=local`, files reside in `.data/uploads/` and access is mediated via signed tokens through `/api/v1/dev-storage` endpoints.
   - When `STORAGE_BACKEND=s3`, the browser uploads directly to MinIO/S3 using presigned PUT URLs, and the API server never streams the raw audio.

