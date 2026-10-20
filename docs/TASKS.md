# Build Plan — MeetScribe

Work one phase at a time. Tick boxes as you finish. Each phase ends with tests passing and a commit.

## Phase 0 — Scaffold
- [x] Monorepo layout from AGENTS.md, `.gitignore`, `.env.example`
- [x] `docker-compose.yml`: postgres, redis, minio, minio-init, api, worker, frontend
- [x] FastAPI app with `/healthz`, config via pydantic-settings
- [x] Alembic initialised, ruff + mypy + pytest configured
- [x] Vite React TS app with Tailwind, router, TanStack Query
- [x] GitHub Actions CI: backend lint/test, frontend lint/test/build

## Phase 1 — Auth and data model
- [x] SQLAlchemy models + first migration (see DATABASE.md)
- [x] Register, login, refresh, me; password hashing; JWT dependency
- [x] Tests for auth flow and ownership dependency
- [x] Frontend: login/register pages, auth context, protected routes, API client with token refresh

## Phase 2 — Upload to S3
- [x] `StorageService` (boto3): presign PUT/GET, head_object, delete, works with MinIO
- [x] `POST /meetings`, `POST /meetings/{id}/complete` with validation
- [x] Frontend: drag-and-drop uploader with progress (XHR PUT to presigned URL), meetings list page
- [x] Tests with moto or MinIO test container

## Phase 3 — Async pipeline skeleton
- [x] Celery app, `process_meeting` chain with stub stages that update status
- [x] `jobs` table updates, retries, `acks_late`
- [x] `/meetings/{id}/status` + frontend polling with progress bar
- [x] Beat task for stuck-job cleanup
- [x] Tests: task state transitions (Celery eager mode)

## Phase 4 — Audio prep and transcription
- [x] `AudioService`: ffprobe duration, ffmpeg normalize to 16kHz mono wav, chunking with overlap-free time offsets
- [x] `Transcriber` interface + `FasterWhisperTranscriber` (model cached per process)
- [x] Merge chunk segments with correct offsets; save transcript row + tsvector
- [x] Tests with a short fixture audio file and a fake transcriber

## Phase 5 — LLM analysis
- [x] `LLMClient` interface + Anthropic implementation, JSON output validated by Pydantic
- [x] Prompts in `app/services/prompts.py` (versioned constants)
- [x] Single-pass and map-reduce paths; dedupe action items
- [x] Persist summary and action items; set `suggested_title`
- [x] Tests with a fake LLM client and golden transcripts

## Phase 6 — Notes UI
- [x] Meeting detail page: summary, key points, decisions, action items table, transcript with clickable timestamps, audio player seeking
- [x] Edit/complete/delete action items (optimistic updates)
- [x] Meetings list with search, status badges, pagination
- [x] Global "My action items" page
- [x] Empty, loading, and error states everywhere

## Phase 7 — Export, retry, delete
- [x] Markdown and PDF export (WeasyPrint or reportlab)
- [x] Retry failed meetings, delete with S3 cleanup
- [x] Friendly error messages mapped from internal errors

## Phase 8 — Hardening and polish
- [x] Rate limiting on auth, upload size/type enforcement, CORS
- [x] `/readyz`, structured logs, optional Flower
- [x] Backend coverage over 70% on services; key frontend tests
- [x] Accessibility pass, responsive layout, dark mode

## Phase 9 — Deploy
- [x] Follow `docs/DEPLOYMENT.md`; live URL and demo video in README
- [x] Architecture diagram image in README

## Stretch
- [ ] Speaker diarization, semantic search (pgvector), email/Slack share, multi-language
