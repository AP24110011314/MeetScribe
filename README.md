# MeetScribe

Upload a meeting recording and get a transcript, a concise summary, key decisions, and a structured list of action items. Transcription and analysis run asynchronously, so uploads never block.

## Features
- Direct-to-S3 audio upload with presigned URLs (mp3, wav, m4a, mp4, webm; up to 500 MB)
- Whisper transcription with timestamps and speaker-agnostic segments
- LLM-generated summary, decisions, and action items (owner, due date, priority)
- Live job progress (queued, transcribing, analyzing, done/failed)
- Editable action items with completion tracking
- Export to Markdown and PDF
- Auth with JWT, per-user data isolation

## Architecture (short)
```
Browser ──presigned PUT──▶ S3/MinIO
   │                         │
   └──REST──▶ FastAPI ──▶ PostgreSQL
                 │
                 └──enqueue──▶ Redis ──▶ Celery worker
                                          ├─ ffmpeg normalize/chunk
                                          ├─ faster-whisper transcribe
                                          └─ LLM summarize + extract
```
Details: `docs/ARCHITECTURE.md`.

## Quick start
```bash
cp .env.example .env        # fill in LLM_API_KEY
docker compose up --build
# Frontend: http://localhost:5173
# API docs: http://localhost:8000/docs
# MinIO console: http://localhost:9001
```

## Environment variables
See `.env.example`. Key ones: `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `JWT_SECRET`, `LLM_PROVIDER`, `LLM_API_KEY`, `WHISPER_MODEL` (e.g. `small`), `WHISPER_DEVICE`.

## Development
See `AGENTS.md` for commands and conventions, and `docs/TASKS.md` for the build plan.

## License
MIT
