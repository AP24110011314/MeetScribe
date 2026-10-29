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

## Phase 1: Data Model and Auth
1. **NullPool in Test Async Engine**:
   - `asyncpg` combined with `pytest-asyncio` function-scoped loops raises `RuntimeError: Event loop is closed` if connections are pooled across tests. `NullPool` ensures each test opens and closes its own connection cleanly.
2. **In-Memory Rate Limiter Reset in Test Fixture**:
   - `slowapi` tracks client IP (`127.0.0.1`). In unit test runs with numerous requests, rate limits accumulated and caused subsequent test failures without resetting `limiter` between test functions.

## Phase 2: Storage and Upload
1. **Dual Boto3 Client Endpoints (Internal vs Presigned)**:
   - In containerized or split-networking dev setups, server-side calls connect to `S3_ENDPOINT_URL` (e.g. `http://localhost:9000`), while browser clients connect to `S3_PUBLIC_ENDPOINT_URL`. The storage service instantiates both internal and presign clients.
2. **Signed Token URLs for Dev Storage**:
   - Dev-storage uses `itsdangerous.URLSafeTimedSerializer` with salt `dev-storage` to generate secure, tamper-proof, short-lived (15 min) tokens containing the target file key and action (`upload` or `download`).
3. **HTTP 206 Partial Content in Dev-Storage**:
   - Waveform renderers (wavesurfer.js) and standard HTML `<audio>` elements rely on RFC 7233 byte-range queries. The dev-storage download endpoint implements byte-range streaming for seamless local audio playback and seeking.

## Phase 3: Async Pipeline Skeleton
1. **Atomic Meeting Claim Pattern**:
   - To prevent duplicate simultaneous worker claims, tasks use `UPDATE meetings ... WHERE status IN ('queued', 'failed') RETURNING ...`. If zero rows are returned, the task terminates immediately without duplicate side effects.
2. **Synchronous DB Session for Celery Workers & Tests**:
   - Celery worker tasks execute synchronously using `psycopg` to avoid event-loop conflicts.
   - In test environments, `conftest.py` maps `SyncSessionLocal` to `TEST_DATABASE_URL_SYNC` so tasks and reaper operations interact with the test database cleanly.
3. **Reaper Beat Task for Stale / Crashed Jobs**:
   - Scheduled via Celery beat every minute to sweep meetings stuck in `['queued', 'preparing', 'transcribing', 'analyzing']` with no update for `REAPER_STALE_MINUTES`. Re-queues up to `MAX_PROCESS_ATTEMPTS` times before marking `failed`.

## Phase 4: Audio and Transcription
1. **Audio Normalization and Chunking Threshold**:
   - Normalization standardizes all input formats to 16 kHz mono PCM 16-bit WAV (`pcm_s16le`).
   - Files $\le 30$ minutes (1800s) remain a single piece to prevent boundary cuts; files $> 30$ minutes are segmented into 10-minute (600s) slices via fast stream copying.
2. **Chunk Timestamp Offset Reconciliation**:
   - Sub-chunk timestamps are shifted by their respective start offsets (`seg.start += offset_sec`, `seg.end += offset_sec`), and segment indices are renumbered sequentially across chunks.
3. **Model Caching in Worker**:
   - `FasterWhisperTranscriber` caches the `WhisperModel` singleton per process on Apple Silicon CPU int8, avoiding repeated disk and model loading overhead.
4. **Automatic tsvector Search Indexing**:
   - Full-text search vectors are maintained by a PostgreSQL database trigger on `transcripts.full_text`, ensuring search indexing remains atomic with row insertion.

## Phase 5: LLM Analysis
1. **Single-Pass vs Map-Reduce Strategy**:
   - Meetings with transcripts $\le 20,000$ tokens are processed in a single prompt.
   - Longer meetings segment into 10-minute chronological windows for section analysis (map phase), followed by an executive synthesis that consolidates key points and dedupes action items (reduce phase).
2. **Validation Error Retry Loop**:
   - LLM responses are validated via Pydantic (`MeetingAnalysis`). On JSON formatting or schema validation errors, the exact error is appended into a retry prompt for one correction turn before failure.
3. **Strict Owner & Due Date Extraction**:
   - Action item owners are extracted only when explicitly identified in dialogue; unassigned items are strictly assigned `owner = None` (no hallucination).
4. **User Title Preservation**:
   - If `meeting.title_edited == True`, any suggested titles from LLM analysis are ignored to preserve user custom titles.
5. **Idempotent Analysis Updates**:
   - Re-running analysis overwrites the `Summary` row and re-creates AI action items (`created_by_ai = True`) without creating duplicate entries or affecting manually created items.

## Phase 6: Notes API Completion
1. **Pure Python PDF Generation with ReportLab**:
   - System libraries like `weasyprint` or `wkhtmltopdf` introduce complex C-dependencies (pango, cairo) that fail or require specific dylib linking on macOS Apple Silicon.
   - `export_pdf` uses pure Python `reportlab` (`SimpleDocTemplate`, `Table`, `Paragraph`) to build professional letter-size PDF summaries with zero system C dependencies.
2. **Cross-Title & Transcript Full-Text Search**:
   - Meeting listing `GET /meetings?q=...` performs an outer join with `Transcript` and evaluates `or_(Meeting.title.ilike(...), Transcript.full_text.ilike(...), Transcript.search_vector.op("@@")(websearch_to_tsquery('english', q)))`.
   - Count queries explicitly count distinct `Meeting.id` over the joined conditions without subquery cartesian products.
3. **Cascading Deletion & Storage Cleanup**:
   - `DELETE /meetings/{id}` removes database records (cascading automatically to transcripts, summaries, action items, and job logs) and synchronously purges the original audio file from S3 / local storage.
4. **Readiness Probe (`/readyz`)**:
   - Probes PostgreSQL with `SELECT 1`, Redis with `PING`, and Storage with `head_bucket` or local directory check. Returns 200 `{"db": "ok", "redis": "ok", "storage": "ok"}` when all are healthy, or 503 if any service fails.





