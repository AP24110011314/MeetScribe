# Architecture — MeetScribe

## Components
| Component | Responsibility |
|-----------|----------------|
| React SPA | Auth, upload UI, status polling, notes view, export |
| FastAPI | REST API, auth, presigned URL issuing, job enqueueing |
| PostgreSQL | Users, meetings, transcripts, summaries, action items, jobs |
| Redis | Celery broker and result backend |
| Celery worker | Audio processing, transcription, LLM analysis |
| S3 / MinIO | Raw audio and normalized audio storage |

## Upload flow
1. Client calls `POST /api/v1/meetings` with filename, content type, size. API validates, creates a `meetings` row (`status=pending_upload`), returns a presigned PUT URL and `meeting_id`.
2. Browser uploads the file straight to S3 using the URL (with progress bar).
3. Client calls `POST /api/v1/meetings/{id}/complete`. API verifies the object exists (`head_object`), sets `status=queued`, creates a `jobs` row, enqueues `process_meeting(meeting_id)`.

## Processing pipeline (Celery chain)
```
process_meeting
  ├─ 1. prepare_audio     download from S3 → ffmpeg → 16kHz mono wav → (chunk if > 30 min) → upload normalized to S3
  ├─ 2. transcribe        faster-whisper per chunk → merge segments with time offsets → save transcript
  ├─ 3. analyze           LLM summary + decisions + action items (map-reduce for long transcripts) → save
  └─ 4. finalize          status=done, cleanup temp files
```
Each stage updates `meetings.status` (`queued → preparing → transcribing → analyzing → done | failed`) and the `jobs` row.

## Reliability rules
- `acks_late=True`, `task_reject_on_worker_lost=True`
- Retries: 3 attempts, exponential backoff, only for transient errors (network, 5xx, rate limit)
- Idempotency: each stage checks if its output already exists (e.g., transcript row) and skips or overwrites safely
- Temp files in a per-job directory, always removed in `finally`
- Dead meetings: a periodic Celery beat task marks meetings stuck in a processing state for over 60 minutes as `failed`

## Transcription service
Interface:
```python
class Transcriber(Protocol):
    def transcribe(self, wav_path: Path, language: str | None) -> TranscriptResult: ...
```
`TranscriptResult` holds `language`, `duration`, `segments: list[Segment(start, end, text)]`.
Implementations: `FasterWhisperTranscriber` (default; model from `WHISPER_MODEL`, loaded once per worker process), `OpenAIWhisperTranscriber` (optional, 25 MB limit means chunking required).

## LLM analysis service
Interface:
```python
class LLMClient(Protocol):
    def complete_json(self, system: str, user: str, schema: type[BaseModel]) -> BaseModel: ...
```
Pipeline:
- If transcript fits in context (about 20k tokens): one call returning `MeetingAnalysis`.
- Otherwise map-reduce: split by time windows (about 10 min), summarize each into partial notes, then a final call merges partials and dedupes action items.
- Output schema (`MeetingAnalysis`): `summary: str`, `key_points: list[str]`, `decisions: list[str]`, `action_items: list[ActionItemDraft]`, `suggested_title: str`.
- Validate with Pydantic; on failure retry once including the validation error; then fail the job.
- Prompt rule: never invent owners or dates; use null when not stated.

## Security
- JWT access (15 min) + refresh (7 days) tokens; passwords hashed with argon2/bcrypt
- Presigned URLs expire in 15 min, scoped to a single key `uploads/{user_id}/{meeting_id}/{filename}`
- S3 bucket private; downloads for playback use short-lived presigned GET
- Content-type and size validation on both API and presign conditions
- CORS restricted to frontend origin; rate limit auth endpoints
- Ownership check dependency used on every meeting route

## Observability
- Structured JSON logs with `meeting_id` and `job_id` fields
- `/healthz` (liveness) and `/readyz` (DB + Redis + S3 checks)
- Optional: Flower for Celery monitoring on port 5555 in dev

## Local infra (docker-compose services)
`api`, `worker`, `beat`, `frontend`, `postgres`, `redis`, `minio`, `minio-init` (creates bucket), optional `flower`.
