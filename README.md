# MeetScribe

Upload a meeting recording and get a transcript, a concise summary, key decisions, and a structured list of action items. Transcription and analysis run asynchronously in Celery workers, so uploads never block the API.

## Features

- **Direct-to-S3 upload**: Presigned PUT URLs with validation (mp3, wav, m4a, mp4, webm, ogg; up to 500 MB)
- **Audio preprocessing**: ffmpeg normalizes to 16 kHz mono WAV and chunks long recordings (30-minute windows)
- **Transcription**: faster-whisper (default, local) with timestamped segments; optional OpenAI Whisper API
- **LLM analysis**: Single-pass or map-reduce over long transcripts (Anthropic by default). JSON output validated with Pydantic, with one retry on validation failure. Never invents owners or dates.
- **Live progress**: Status polling with derived progress percentages through queued → preparing → transcribing → analyzing → done/failed
- **Notes UI**: Meeting detail with summary, key points, decisions, action items table, transcript with timestamps, and audio playback
- **Action items**: Create/edit/complete/delete per meeting or from the global "My action items" page
- **Export**: Download notes as Markdown or PDF
- **Auth**: JWT access/refresh tokens with per-user data isolation

## Architecture

```
Browser ──presigned PUT──▶ S3/MinIO
   │                         │
   └──REST──▶ FastAPI ──▶ PostgreSQL
                 │
                 └──enqueue──▶ Redis ──▶ Celery worker
                                          ├─ prepare: download/normalize/chunk/upload
                                          ├─ transcribe: Whisper + merge timestamps
                                          ├─ analyze: LLM summary/decisions/action items
                                          └─ finalize: cleanup temp files
```

See `docs/ARCHITECTURE.md` for full details.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2
- **Worker**: Celery 5 + Redis
- **Database**: PostgreSQL 16
- **Storage**: S3/MinIO via boto3
- **Transcription**: faster-whisper / OpenAI Whisper
- **LLM**: Anthropic (default) via provider interface
- **Frontend**: React 18, Vite, TypeScript, TanStack Query, React Router, Tailwind CSS

## Quick Start

```bash
cp .env.example .env        # set LLM_API_KEY and other required values
docker compose up --build
```

Services:
- Frontend: http://localhost:5173
- API: http://localhost:8000 (docs at http://localhost:8000/docs)
- MinIO console: http://localhost:9001

## Environment Variables

See `.env.example` for the full list. Key variables:
- `DATABASE_URL`, `REDIS_URL`
- `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_ENDPOINT_URL`
- `JWT_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`
- `TRANSCRIBER` (`faster-whisper` or `openai`), `WHISPER_MODEL`, `TRANSCRIBE_LANGUAGE`, `AUDIO_CHUNK_SECONDS`
- `LLM_PROVIDER` (`anthropic` or `openai`), `LLM_API_KEY`, `LLM_MODEL`, `ANALYSIS_TOKEN_BUDGET`, `MAP_WINDOW_SEC`
- `CORS_ORIGINS`, `MAX_UPLOAD_MB`

## Development

```bash
# Backend
cd backend
pytest -q
ruff check . && ruff format . && mypy app

# Frontend
cd frontend
npm run dev
npm test && npm run lint && npm run typecheck && npm run build
```

See `AGENTS.md` for full conventions and `docs/TASKS.md` for the build plan.

## Documentation

- `docs/PRD.md` — Product requirements
- `docs/ARCHITECTURE.md` — System design
- `docs/DATABASE.md` — Schema
- `docs/API.md` — REST API
- `docs/PROMPTS.md` — LLM prompts
- `docs/DECISIONS.md` — Design decisions
- `docs/DEPLOYMENT.md` — Deployment guide

## License

MIT
