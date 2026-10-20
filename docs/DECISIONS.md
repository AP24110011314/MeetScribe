# DECISIONS — MeetScribe

Log of non-obvious assumptions and decisions, per AGENTS.md. Newest last.

## D1 — Docs live in docs/ (Phase 0)
AGENTS.md and PROMPT.md reference `docs/`, and the seven source-of-truth documents (PRD,
ARCHITECTURE, DATABASE, API, PROMPTS, TASKS, DEPLOYMENT) now live in `docs/` only — the
root copies no longer exist. `docs/` is the canonical location; checkboxes are ticked
there. AGENTS.md, PROMPT.md and README.md stay at the repo root.

## D2 — Project files live at repo root
AGENTS.md's layout drawing shows a `meetscribe/` directory, but the repository root
already is the project. `backend/`, `frontend/`, `docker-compose.yml` etc. sit at the
repo root. No nested wrapper directory.

## D3 — Refresh tokens travel in the request body (Phase 1, from API.md)
`POST /auth/refresh` takes `{refresh_token}` in the JSON body (per API.md), not an
httpOnly cookie. Simpler and works with the React SPA + fetch; tradeoff: tokens are
JS-accessible. Revisit with cookies if this ships beyond a portfolio piece.

## D4 — Rate limiting will use slowapi (Phase 8)
ARCHITECTURE.md requires auth rate limiting but names no library. `slowapi` is the
simplest FastAPI-native option (slowapi: Flask-Limit style limiter for Starlette).
Will be applied to `/auth/login` and `/auth/register` only.

## D5 — Analysis constants (Phase 5)
"About 20k tokens" → `ANALYSIS_TOKEN_BUDGET = 20000`. "About 10 min" map windows →
`MAP_WINDOW_SEC = 600`. Token estimation: chars / 4 (no tokenizer dependency).

## D6 — OpenAI Whisper provider implemented but not default (Phase 4)
ARCHITECTURE.md calls `OpenAIWhisperTranscriber` optional. It will be implemented behind
the same `Transcriber` interface (env `TRANSCRIBER=openai`) but the default remains
`faster_whisper`. No model downloads in unit tests either way.

## D7 — Unit tests never touch models or real services (all phases)
`faster_whisper` is imported lazily inside the transcriber implementation so collecting
tests never triggers a model download. LLM, S3, and transcriber are mocked/faked in
tests (moto for S3 in Phase 2, FakeTranscriber, FakeLLMClient).

## D8 — CI stays CPU-light (all phases)
CI runs backend lint/type/tests and frontend lint/type/tests/build. No Whisper model
downloads, no docker-compose in CI for now. Full end-to-end verification happens locally
via `docker compose up --build`.

## D9 — compose includes a `beat` service from Phase 0 (ARCHITECTURE.md local infra)
ARCHITECTURE.md lists `beat` in the compose services; TASKS.md Phase 0 omits it. It is
included from the start (same image as api/worker, no tasks until Phase 3) so the
reliability sweep task has a home when Phase 3 lands.

## D10 — Frontend talks to the API via relative `/api` paths + Vite dev proxy (Phase 0)
The SPA calls `/api/v1/...` relative paths. In dev the Vite server proxies `/api` to the
backend (`VITE_PROXY_TARGET`, default `http://localhost:8000`, `http://api:8000` inside
compose). This avoids hardcoded hosts and CORS complexity in dev; production serves the
built SPA behind the same origin (Phase 9).

## D11 — S3 endpoint config treats empty string as "use AWS default" (Phase 2)
DEPLOYMENT.md says production sets `S3_ENDPOINT_URL` empty. Config models it as `str`
defaulting to the MinIO URL; the StorageService converts `""` to `None` for boto3 so
AWS default endpoints are used. (Recorded now because it shaped `.env.example`.)

## D12 — Progress percentage derivation (Phase 3)
API.md maps statuses to progress (`queued 5%`, `preparing 15%`, `transcribing 15-70%`,
`analyzing 70-95%`, `done 100%`). `jobs` schema has no progress column, so
`progress_pct` is derived from the latest job's `stage` plus the meeting status; the
chunk-based refinement within `transcribing` uses the segment/chunk counts recorded on
the job row's `error`-adjacent metadata only if needed later — no schema change.

## D13 — LocalStack replaces MinIO for local S3 (Phase 0)
The docs specify MinIO for local dev, but `minio/minio` and `minio/mc` can no longer be
pulled on this machine (Docker Hub returns 404 for the repo; `quay.io/minio/minio`
requires auth). Swapped for `localstack/localstack:3.8` with `SERVICES=s3`, which speaks
the same S3 API (presigned PUT/GET, head_object, delete) the app relies on. Consequences:
  - compose has one `localstack` service (replacing `minio` + `minio-init`); the bucket is
    created by `scripts/localstack-init.sh` via `awslocal`.
  - Local S3 endpoint becomes `http://localstack:4566` (internal) /
    `http://localhost:9000` (browser-facing, same as before).
  - Production is unaffected: `S3_ENDPOINT_URL=""` uses real AWS S3 (D11).
  - S3 access still goes through `StorageService` only, so tests use moto regardless.

## D14 — Auth libraries: passlib+bcrypt, PyJWT (Phase 1)
ARCHITECTURE.md says "argon2/bcrypt" hashing. Chose bcrypt via `passlib[bcrypt]` (the
most widely used, no native build issues) plus `PyJWT` for tokens (lighter than
python-jose, no cryptography pin conflicts). `bcrypt` is pinned `<4.1` because passlib
1.7.4 reads `bcrypt.__about__`, which 4.1 removed.

## D15 — Tests run against a real Postgres test database (Phase 1)
The schema uses Postgres-only features (native enums, `tsvector` generated columns,
`gen_random_uuid()`), so SQLite cannot stand in. Backend tests use a dedicated
`meetscribe_test` database (`TEST_DATABASE_URL`, default via local compose Postgres).
Each test gets a fresh engine bound to its own event loop with `NullPool`, and tables are
truncated before each test. The schema is created by `Base.metadata.create_all`; the
migration itself is verified separately with `alembic upgrade head`.

## D16 — JWT settings (Phase 1)
Access tokens 15 min, refresh tokens 7 days, HS256, per ARCHITECTURE.md. Claims:
`sub` (user id), `type` (`access`/`refresh`), `iat`, `exp`. A token's `type` is checked on
use, so a refresh token cannot be replayed as an access token (tested).

## D17 — API errors use a typed `APIError` + handlers (Phase 1)
docs/API.md requires `{"detail", "code"}`. Added `app/core/errors.py` (`APIError`) with a
FastAPI exception handler rendering that shape, plus a catch-all 500 handler returning
`INTERNAL_ERROR`. Pydantic validation errors still use FastAPI's default 422 shape.

## D18 — Frontend auth: token store, context, refresh-on-401 (Phase 1)
Tokens in `localStorage` (consistent with D3). `src/api/client.ts` attaches the access
token and, on the first 401, calls `/auth/refresh` once and retries; a failed refresh
clears tokens. `AuthContext`/`AuthProvider` split into two files so the provider file
exports only components (react-refresh rule).

## D19 — jsdom localStorage shim in tests (Phase 1)
jsdom 25 under Node 26 does not expose `localStorage`, which broke token-store tests. The
Vitest setup installs a minimal in-memory `Storage` shim only when the global is missing.
Browsers are unaffected.

## D20 — Upload validation rule (Phase 2)
`POST /meetings` accepts a file when its `content_type` is in the allowed set
(`audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/mp4`, `audio/m4a`, `audio/x-m4a`,
`audio/webm`, `audio/ogg`, `video/mp4`, `video/webm`), or when the type is generic
(`application/octet-stream`/empty) **and** the filename ends in an allowed extension. A
disallowed concrete type (e.g. `application/pdf`) is rejected with 415 regardless of the
filename. Oversize files are rejected with 413 using `MAX_UPLOAD_MB`. PRD F1 lists
formats; browsers sometimes omit a precise type, hence the extension fallback.

## D21 — Presign uses two boto3 clients (Phase 2)
`S3_ENDPOINT_URL` (internal, e.g. `http://localstack:4566`) is used for `head_object` and
`delete_object`; `S3_PUBLIC_ENDPOINT_URL` (`http://localhost:9000`) is used to build
presigned URLs the browser can resolve. When both are equal, one client is reused. This
keeps the Docker-internal hostname out of browser-facing URLs.

## D22 — A generic type with a wrong extension is rejected (Phase 2)
See D20: the octet-stream fallback requires a matching extension, so `notes.txt` as
`application/octet-stream` is a 415. Both paths are covered by tests.

## D23 — Ruff ignores B008 (Phase 2)
FastAPI's `Query(...)`/`Depends(...)` are called in argument defaults by design, so the
`B008` (function call in default) rule is disabled project-wide.

## D24 — LocalStack runs with S3_SKIP_SIGNATURE_VALIDATION=1 (Phase 2)
Presigned PUT URLs generated for the browser were rejected with `SignatureDoesNotMatch`
by LocalStack's default S3 signature validation (reproduced with a bare boto3 presign +
curl; ordinary signed boto3 requests worked). With `S3_SKIP_SIGNATURE_VALIDATION=1` the
presigned PUT returns 200 and the object is stored. The app's presign/head/delete code is
unchanged and correct — this is a LocalStack-specific dev accommodation. Production uses
real AWS S3, which validates signatures normally. Verified end to end: create → presigned
PUT → `head_object` → `queued`.

## D25 — Progress percentages are derived, not stored (Phase 3)
`GET /meetings/{id}/status` returns `progress_pct` computed from the meeting status per
docs/API.md's mapping (`queued 5`, `preparing 15`, `transcribing 15` (chunk-scaled in
Phase 4), `analyzing 70`, `done 100`, `failed 0`). No column is added for it, so the
progress bar needs no schema change and no extra writes per stage.

## D26 — The pipeline runs as one task in Phase 3 (Phase 3)
`process_meeting` walks the four stages sequentially inside a single Celery task rather
than a Celery `chain` of four tasks. The stages are pure stubs here, so a chain would only
add broker round-trips. When Phase 4/5 give stages real work, the split point is already
clean (`pipeline.build_stages` + `pipeline.run_pipeline`) and can become a chain without
touching the API or the status bookkeeping.

## D27 — Transient failures do not fail the meeting immediately (Phase 3)
A `TransientStageError` leaves the meeting in its in-progress status (so a retry re-enters
the same stage) and records the error on the `jobs` row; only after retries are exhausted
(or for a `PermanentStageError`) is the meeting set to `failed`. This matches
ARCHITECTURE.md's "retry only transient errors, 3 attempts with backoff". Retry backoff is
`min(2**attempt * 30s, PIPELINE_MAX_RETRIES * 60s)`.

## D28 — Stuck-meeting sweep runs every 10 minutes (Phase 3)
The beat task `sweep_stuck_meetings` runs on a 10-minute schedule and fails any meeting
still in `queued|preparing|transcribing|analyzing` whose `updated_at` is older than
`STUCK_MEETING_MINUTES` (default 60). It uses `updated_at` because it is maintained
automatically by the ORM on every stage write.

## D29 — The async pipeline core is testable without a broker (Phase 3)
`pipeline.run_pipeline(session, meeting_id)` is async and takes the caller's session, so
tests await it directly. The sync Celery driver lives in `tasks.run_pipeline` and wraps the
core in `run_sync` (its own event loop, disposing the engine pool each call because asyncpg
connections are loop-bound). Tests that need the sync path run as plain `def` tests to
avoid nesting `asyncio.run`. `complete_upload` enqueues through the small
`enqueue_processing` indirection, which the test suite monkeypatches so no test touches
Redis.

## D30 — Celery task decorators are exempt from mypy's untyped-decorator rule (Phase 3)
`celery_app.task` / `shared_task` ship no type stubs, so functions decorated with them are
flagged `untyped-decorator` under strict mypy. A per-module override disables only that
check for `app.workers.tasks` and `app.workers.celery_app`; everything else stays strict.

## D31 — Long recordings are chunked at 30-minute windows (Phase 4)
`AUDIO_CHUNK_SECONDS` defaults to 1800. A recording at or under one window is normalized
into a single 16 kHz mono WAV; longer recordings are split by ffmpeg's segment muxer into
fixed 1800 s windows. This bounds the model's per-pass input (memory/latency) while keeping
the number of Whisper calls small for typical meetings. Both `CHUNK_SECONDS` and the
"≤1 window = 1 chunk" rule are what `expected_chunk_count` reports for progress.

## D32 — Chunk timestamps are corrected with exact window offsets (Phase 4)
Each chunk starts at `index * chunk_seconds`, and `merge_segments` adds that offset to every
segment the chunk produced, then sorts by start time. Because the segment muxer starts from
a fixed `-ss 0` with `-reset_timestamps 1`, chunk `i` covers exactly
`[i * chunk_seconds, (i+1) * chunk_seconds)`, so merged timestamps are relative to the full
recording — which the transcript UI and the audio-player seek (F4) rely on. Units in the
merge are pure functions unit-tested without ffmpeg.

## D33 — Each job gets a temp dir that the finalize stage always removes (Phase 4)
`WORKER_TEMP_DIR` (default `/tmp/meetscribe`) holds one directory per meeting for the
downloaded original, the normalized WAV, and chunks. The `finalize` stage removes it with
`shutil.rmtree(..., ignore_errors=True)`. A failed/crashed run may leave a dir behind; it is
harmless (idempotent stages re-create what they need) and is reclaimed when the stage reruns
to completion. Audio itself is streamed to/from S3 via `download_to_file`/`upload_file`, so
it never passes through the API server or a single unbounded in-memory buffer (AGENTS.md
rule 5).

## D34 — Pipeline stages are idempotent by object/row existence (Phase 4)
`prepare` skips download+normalize+upload when the normalized S3 object already exists (and
recovers `duration_sec` from the meeting row). `transcribe` skips when a `transcripts` row
already exists. Together with the Phase 3 status/job bookkeeping this makes `process_meeting`
safe to re-run after a retry or a partially completed attempt, per AGENTS.md rule 6.

## D35 — faster-whisper is imported lazily and the model is cached per process (Phase 4)
`FasterWhisperTranscriber` imports `faster_whisper` and constructs `WhisperModel` on first
`transcribe()` call, then caches it on the instance. The API process and the whole test
suite therefore never import torch/ctranslate2 or download weights (D7). The transcriber is
built per job via `get_transcriber()`, so a worker process reuses one model across the tasks
it handles. `faster-whisper` is a core dependency; `openai` (the D6 provider) is an optional
extra (`pip install .[openai]`) so it is only present when `TRANSCRIBER=openai` is used.

## D35 — faster-whisper is imported lazily and the model is cached per process (Phase 4)
`FasterWhisperTranscriber` imports `faster_whisper` and constructs `WhisperModel` on first
`transcribe()` call, then caches it on the instance. The API process and the whole test
suite therefore never import torch/ctranslate2 or download weights (D7). The transcriber is
built per job via `get_transcriber()`, so a worker process reuses one model across the tasks
it handles. `faster-whisper` is a core dependency; `openai` (the D6 provider) is an optional
extra (`pip install .[openai]`) so it is only present when `TRANSCRIBER=openai` is used.

## D36 — "No speech detected" is a permanent failure (Phase 4)
Whisper runs with `vad_filter=True`; if the recording yields no non-empty segments the
transcribe stage raises `PermanentStageError` and the meeting is marked `failed` with a
clear message rather than retrying forever. Silence, pure tones, and unreadable media all
fall here. Verified live: a 440 Hz test tone was correctly rejected as "No speech detected"
while a spoken clip transcribed cleanly.

## D37 — Token budget uses a simple chars/4 estimator (Phase 5)
`ANALYSIS_TOKEN_BUDGET` defaults to 20000 and `estimate_tokens` does `len(text) / 4` with
no tokenizer dependency (ARCHITECTURE.md suggests "about 20k tokens"). The threshold is
used to pick single-pass vs map-reduce (D38). Logs include the estimated count when
routing to map-reduce; full transcript text is never logged at INFO level.

## D38 — Map-reduce over 10-minute windows for long transcripts (Phase 5)
When the estimated transcript exceeds the budget, `split_into_windows` groups consecutive
segments into windows of `MAP_WINDOW_SEC` (default 600 s) starting at `index*window_sec`
boundaries. Each window is summarized into a `PartialAnalysis` by a map call (with the same
owner/date/null rules), and a single reduce call merges them. If the window logic would
produce an empty window it is skipped; windows always include at least the segment that
crosses the boundary so no content is lost. Deterministic dedupe of action items and
decisions is re-enforced after the reduce step.

## D39 — Exactly one retry on LLM JSON/schema validation failure (Phase 5)
The model is asked for JSON-only output matching the Pydantic schema. If parsing or
`model_validate` fails, `_complete_with_retry` catches `LLMValidationError`, logs a
warning with the compact error, appends
`"Your previous output was invalid: {error}. Return corrected JSON only."` to the user
message, and retries once. A second failure propagates as `LLMValidationError` and the
pipeline treats it as a `PermanentStageError` (D42). Transport/5xx/rate-limit errors raise
`TransientLLMError` and are retried by the existing backoff mechanism.

## D40 — Never invent owners or dates; resolve dates against meeting creation time (Phase 5)
`ActionItemDraft.owner` is accepted as-is when spoken and coerced to `None` if empty
whitespace appears. `due_date` is only accepted when the model resolves it to an ISO date
(or emits `null`); `analysis_service` uses `meeting.created_at.date()` as `meeting_date`
for relative-date resolution. `merge_action_items` deduplicates by description (case-
insensitive), keeping the item with the earliest `source_start_sec`. Manual action items
(`created_by_ai = false`) are preserved across re-runs; only AI items are replaced.

## D41 — Analyze stage is idempotent (Phase 5)
`notes_service.save_analysis` upserts the `summaries` row and deletes+re-inserts AI action
items only (`DELETE ... WHERE created_by_ai = true`), so manual items created via
`POST /meetings/{id}/action-items` survive a re-run. If `suggested_title` is non-empty the
meeting title is updated (the DB default is the original filename). The pipeline core
re-enters stages safely per Phase 3; re-running `analyze` is cheap and deterministic with
a `FakeLLMClient`.

## D42 — LLM errors are classified for retry semantics (Phase 5)
`AnthropicLLMClient` / `OpenAICompatibleLLMClient` wrap transport failures as
`TransientLLMError` (rate limit / timeout / network / 5xx) so `run_pipeline` retries with
backoff. A schema/JSON parse failure becomes `LLMValidationError`, retried exactly once by
`analysis_service` (D39), and if it persists the pipeline stage raises `PermanentStageError`
and marks the meeting `failed` without wasting retry budget. Provider SDKs are imported
lazily; `anthropic` is a core dependency, `openai` remains optional.
