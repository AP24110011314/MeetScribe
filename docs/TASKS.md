# Build Plan — MeetScribe

Work one phase at a time. Tick boxes as you finish. Each phase ends with tests passing and a commit.

## Phase 0 — Scaffold
- [ ] Monorepo layout from AGENTS.md, `.gitignore`, `.env.example`
- [ ] `docker-compose.yml`: postgres, redis, minio, minio-init, api, worker, frontend
- [ ] FastAPI app with `/healthz`, config via pydantic-settings
- [ ] Alembic initialised, ruff + mypy + pytest configured
- [ ] Vite React TS app with Tailwind, router, TanStack Query
- [ ] GitHub Actions CI: backend lint/test, frontend lint/test/build

## Phase 1 — Auth and data model
- [ ] SQLAlchemy models + first migration (see DATABASE.md)
- [ ] Register, login, refresh, me; password hashing; JWT dependency
- [ ] Tests for auth flow and ownership dependency
- [ ] Frontend: login/register pages, auth context, protected routes, API client with token refresh

## Phase 2 — Upload to S3
- [ ] `StorageService` (boto3): presign PUT/GET, head_object, delete, works with MinIO
- [ ] `POST /meetings`, `POST /meetings/{id}/complete` with validation
- [ ] Frontend: drag-and-drop uploader with progress (XHR PUT to presigned URL), meetings list page
- [ ] Tests with moto or MinIO test container

## Phase 3 — Async pipeline skeleton
- [ ] Celery app, `process_meeting` chain with stub stages that update status
- [ ] `jobs` table updates, retries, `acks_late`
- [ ] `/meetings/{id}/status` + frontend polling with progress bar
- [ ] Beat task for stuck-job cleanup
- [ ] Tests: task state transitions (Celery eager mode)

## Phase 4 — Audio prep and transcription
- [ ] `AudioService`: ffprobe duration, ffmpeg normalize to 16kHz mono wav, chunking with overlap-free time offsets
- [ ] `Transcriber` interface + `FasterWhisperTranscriber` (model cached per process)
- [ ] Merge chunk segments with correct offsets; save transcript row + tsvector
- [ ] Tests with a short fixture audio file and a fake transcriber

## Phase 5 — LLM analysis
- [ ] `LLMClient` interface + Anthropic implementation, JSON output validated by Pydantic
- [ ] Prompts in `app/services/prompts.py` (versioned constants)
- [ ] Single-pass and map-reduce paths; dedupe action items
- [ ] Persist summary and action items; set `suggested_title`
- [ ] Tests with a fake LLM client and golden transcripts

## Phase 6 — Notes UI
- [ ] Meeting detail page: summary, key points, decisions, action items table, transcript with clickable timestamps, audio player seeking
- [ ] Edit/complete/delete action items (optimistic updates)
- [ ] Meetings list with search, status badges, pagination
- [ ] Global "My action items" page
- [ ] Empty, loading, and error states everywhere

## Phase 7 — Export, retry, delete
- [ ] Markdown and PDF export (WeasyPrint or reportlab)
- [ ] Retry failed meetings, delete with S3 cleanup
- [ ] Friendly error messages mapped from internal errors

## Phase 8 — Hardening and polish
- [ ] Rate limiting on auth, upload size/type enforcement, CORS
- [ ] `/readyz`, structured logs, optional Flower
- [ ] Backend coverage over 70% on services; key frontend tests
- [ ] Accessibility pass, responsive layout, dark mode

## Phase 9 — Deploy
- [ ] Follow `docs/DEPLOYMENT.md`; live URL and demo video in README
- [ ] Architecture diagram image in README

## Stretch
- [ ] Speaker diarization, semantic search (pgvector), email/Slack share, multi-language
