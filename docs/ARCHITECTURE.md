# Architecture — MeetScribe

## Components and ports
| Component | Port | Notes |
|---|---|---|
| FastAPI (uvicorn) | **8000** | REST API, auth, presigning, enqueueing |
| React + Vite | 5173 | Dev server; proxies `/api` to `http://127.0.0.1:8000` |
| PostgreSQL 16 | 5432 | Homebrew service |
| Redis | 6379 | Homebrew service, Celery broker |
| MinIO API / console | 9000 / 9001 | Homebrew binary, data in `.data/minio` |
| Celery worker | none | `--pool=solo`, one job at a time |
| Celery beat | none | schedules the reaper |

## Upload flow
1. Client `POST /api/v1/meetings` with filename, content type, size. API validates, creates meeting (`pending_upload`), returns `meeting_id` and a presigned PUT URL.
2. Browser PUTs the file straight to MinIO/S3 with progress events.
3. Client `POST /api/v1/meetings/{id}/complete`. API checks the object exists (`head_object`), sets `queued`, enqueues `process_meeting(meeting_id)`.

### Storage backends (`STORAGE_BACKEND`)
- `s3`: MinIO or AWS S3. Presigned URLs use `S3_PUBLIC_ENDPOINT_URL` (the host the browser reaches). Server-side calls use `S3_ENDPOINT_URL`.
- `local`: dev-only fallback. Files live in `.data/uploads/`. The API issues signed tokens (itsdangerous, 15 min) and serves `PUT /api/v1/dev-storage/upload/{token}` and `GET /api/v1/dev-storage/download/{token}` with HTTP Range support. This is the only case where audio passes through the API. Disabled when backend is `s3`.
- Both implement `StorageService`: `presign_upload`, `presign_download`, `exists`, `download_to(path)`, `upload_from(path)`, `delete(prefix_or_key)`.

Key layout: `uploads/{user_id}/{meeting_id}/original.{ext}` and `uploads/{user_id}/{meeting_id}/normalized.wav`.

## Processing pipeline
```
process_meeting(meeting_id)
  1. prepare_audio  download → ffprobe duration → ffmpeg 16 kHz mono wav → chunk (> 30 min, 10 min chunks) → upload normalized
  2. transcribe     Transcriber per chunk → merge segments with offsets → save transcript
  3. analyze        LLM summary + decisions + action items (map-reduce if long) → save
  4. finalize       status=done, set title if untouched, remove temp dir
```
Statuses: `pending_upload → queued → preparing → transcribing → analyzing → done | failed`.
`progress_pct`: queued 5, preparing 15, transcribing 15 to 70 (by chunk), analyzing 70 to 95, done 100.

## Reliability
- `acks_late=True`, `task_reject_on_worker_lost=True`, `visibility_timeout` 2 hours (avoids duplicate delivery of long jobs).
- Each stage first checks if its output already exists and skips it; saving results is a single transaction. Running twice is safe.
- A stage claims work with `UPDATE meetings SET status=... WHERE id=... AND status IN (allowed)`; if 0 rows, it exits (prevents duplicate concurrent processing).
- Every stage and every chunk touches `meetings.updated_at` (heartbeat).
- **Reaper** (Celery beat, every minute): meetings in `preparing|transcribing|analyzing|queued` with no `updated_at` change for `REAPER_STALE_MINUTES` (default 15) are re-enqueued, up to 2 times (`process_attempts`), then set to `failed` with a readable error. This is how a `kill -9` of the worker is recovered. A normal Ctrl+C (warm shutdown) re-queues the task immediately.
- Retries: 3 with exponential backoff for transient errors (network, 5xx, 429). Validation or unsupported-file errors fail immediately.
- Temp files in a per-job directory removed in `finally`.

## Transcription
```python
class Transcriber(Protocol):
    def transcribe(self, wav_path: Path, language: str | None) -> TranscriptResult: ...
```
- `FasterWhisperTranscriber`: model from `WHISPER_MODEL`, `compute_type=int8`, `device=cpu`, loaded once per worker process, VAD filter on.
- `OpenAITranscriber`: optional; chunks must be under 25 MB.
- `FakeTranscriber`: returns fixed segments; used in tests and offline pipeline checks.

## LLM analysis
```python
class LLMClient(Protocol):
    def complete_json(self, system: str, user: str, schema: type[BaseModel]) -> BaseModel: ...
```
- Short transcript (about 20k tokens or less): one call returning `MeetingAnalysis`.
- Longer: split into about 10-minute windows → partial notes → final merge call that dedupes action items.
- Schema `MeetingAnalysis`: `summary`, `key_points`, `decisions`, `action_items[]`, `suggested_title`.
- Invalid JSON: retry once with the validation error appended, then fail the stage.
- Providers: `anthropic`, `fake`. The fake client returns deterministic output derived from keywords so pipeline tests are stable.

## Security
- Access token 15 min, refresh token 7 days; argon2 password hashes.
- Presigned URLs expire in 15 min and are scoped to one key.
- Bucket stays private. Playback uses a short-lived presigned GET.
- Type and size validated at the API and in presign conditions.
- CORS limited to `CORS_ORIGINS`. `slowapi` rate limits `/auth/*` (10 per minute per IP).
- An `get_owned_meeting` dependency is used on every meeting route; other users get 404.
- Transcripts are never logged at INFO level.

## Observability
Structured JSON logs with `meeting_id`, `job_id`, `stage`. `/healthz` (liveness) and `/readyz` (DB, Redis, storage).

## Frontend integration
Vite proxy: `/api` → `http://127.0.0.1:8000`. Presigned upload URLs go directly to MinIO (CORS is open by default on MinIO; AWS needs bucket CORS for `PUT, GET, HEAD` from the app origin).
