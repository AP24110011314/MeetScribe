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

---

## Prerequisites

| Tool | Version | Check Command |
|------|---------|---------------|
| Git | 2.x+ | `git --version` |
| Python | 3.11 | `python3.11 --version` |
| Node.js | 20+ | `node --version` |
| PostgreSQL | 16 | `psql --version` |
| Redis | 7+ | `redis-cli --version` |
| ffmpeg | 6+ | `ffmpeg -version` |
| LocalStack (S3) | — | via Docker |

**Minimum RAM**: 8 GB recommended for local Whisper.

---

## Quick Start (Local Development)

This runs the backend, worker, beat, and frontend directly on your machine for faster iteration. PostgreSQL, Redis, and LocalStack (S3) run as local services.

**Assumes:** macOS on Apple Silicon with Homebrew. Adjust commands for other platforms.

### 1. Install prerequisites

```bash
# Homebrew packages
brew install python@3.11 node@20 postgresql@16 redis ffmpeg awscli

# Start PostgreSQL and Redis
brew services start postgresql@16 redis
```

### 2. Create database and user

```bash
# Create database
createdb -U $(whoami) meetscribe

# Create DB user and grant privileges
psql -U $(whoami) -d meetscribe -c "CREATE USER meet WITH PASSWORD 'meet';"
psql -U $(whoami) -d meetscribe -c "GRANT ALL PRIVILEGES ON DATABASE meetscribe TO meet;"
psql -U $(whoami) -d meetscribe -c "ALTER USER meet CREATEDB;"
```

### 3. Start LocalStack (S3) via Docker

**Terminal 1** (stays running):
```bash
docker run -d --name localstack -p 4566:4566 -p 4510-4559:4510-4559 \
  -e SERVICES=s3 -e DEFAULT_REGION=us-east-1 -e S3_SKIP_SIGNATURE_VALIDATION=1 \
  localstack/localstack:3.8
```

Create the bucket (wait ~10s for LocalStack to start):
```bash
AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
aws --endpoint-url=http://localhost:4566 s3 mb s3://meetscribe
```

### 4. Set up the backend

```bash
cd backend

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Configure environment (create backend/.env)
cat > .env << 'EOF'
ENV=development
DATABASE_URL=postgresql+asyncpg://meet:meet@localhost:5432/meetscribe
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=dev-secret-key-that-is-at-least-32-bytes-long-for-testing
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
S3_ENDPOINT_URL=http://localhost:4566
S3_PUBLIC_ENDPOINT_URL=http://localhost:4566
S3_BUCKET=meetscribe
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
TRANSCRIBER=faster_whisper
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
TRANSCRIBE_LANGUAGE=
AUDIO_CHUNK_SECONDS=1800
OPENAI_API_KEY=
OPENAI_WHISPER_MODEL=whisper-1
WORKER_TEMP_DIR=/tmp/meetscribe
LLM_PROVIDER=anthropic
LLM_API_KEY=
LLM_MODEL=claude-sonnet-4-6
ANALYSIS_TOKEN_BUDGET=20000
MAP_WINDOW_SEC=600
MAX_UPLOAD_MB=500
PIPELINE_MAX_RETRIES=3
STUCK_MEETING_MINUTES=60
CORS_ORIGINS=http://localhost:5173
EOF

# Run migrations
alembic upgrade head
```

> **Important**: Edit `backend/.env` and set `LLM_API_KEY` to your Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com)). Without it, the analysis stage will fail.

### 5. Start each process in its own terminal

**Terminal 2** — API (stays running):
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 3** — Celery Worker (stays running):
```bash
cd backend
source .venv/bin/activate
# On macOS, use --pool=solo to avoid fork issues:
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO --concurrency=2 --pool=solo
```

**Terminal 4** — Celery Beat (stays running):
```bash
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app:celery_app beat --loglevel=INFO
```

### 6. Set up the frontend

**Terminal 5** (or new tab):
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 7. Access the application

| Service | URL |
|---------|-----|
| **Frontend (UI)** | http://localhost:5173 |
| **API Docs (Swagger)** | http://localhost:8000/docs |
| **API Health Check** | http://localhost:8000/healthz |
| **API Readiness Check** | http://localhost:8000/readyz |
| **LocalStack S3** | http://localhost:4566 |

### 8. Create an account and start using MeetScribe

1. Open http://localhost:5173
2. Click **Register** to create an account
3. Log in and upload a meeting recording (mp3, wav, m4a, mp4, webm, ogg — up to 500 MB)
4. Wait for processing (status updates in real-time)
5. View the transcript, summary, decisions, and action items

---

## Using Make Commands

The `Makefile` provides convenient shortcuts:

```bash
# One-time setup
make setup

# Run migrations
make migrate

# Start services (each in its own terminal)
make backend-dev
make worker-dev
make beat-dev
make frontend-dev

# Testing and linting
make test
make lint
make fmt
make typecheck
```

---

## Run the Tests

### Backend tests

```bash
cd backend
source .venv/bin/activate
TEST_DATABASE_URL=postgresql+asyncpg://meet:meet@localhost:5432/meetscribe_test \
JWT_SECRET=test-secret-key-that-is-at-least-32-bytes-long-for-testing \
pytest -q
```

### Frontend tests

```bash
cd frontend
npm test
```

### Lint & Type Check

**Backend** (from `backend/`):
```bash
source .venv/bin/activate
ruff check . && ruff format . && mypy app
```

**Frontend** (from `frontend/`):
```bash
npm run lint && npm run typecheck
```

---

## Verify It Works

Use the smoke test script to run an end-to-end test:

```bash
# Generate a test audio file (macOS)
say -v Samantha "Hello team. This is a test meeting. John will update the documentation by Friday. Sarah will review the pull request by tomorrow. Meeting adjourned." -o /tmp/test_meeting.aiff
ffmpeg -y -i /tmp/test_meeting.aiff -ar 16000 -ac 1 /tmp/test_meeting.wav

# Run smoke test (requires LLM_API_KEY in .env for full processing)
./scripts/smoke_test.sh
```

Expected output (with valid `LLM_API_KEY`):
```
=== MeetScribe Smoke Test ===
API: http://localhost:8000/api/v1
Audio: /tmp/test_meeting.wav
1. Registering test user...
2. Logging in...
3. Creating meeting...
4. Uploading audio to S3...
   Upload successful (HTTP 200)
5. Completing meeting (enqueueing processing)...
   Meeting queued for processing
6. Polling status...
   Poll 1/60: status=queued stage= progress=5%
   ...
   Poll N/60: status=done stage=finalize progress=100%
7. Fetching meeting detail...
8. Verifying results...
   Transcript: yes
   Summary: yes
   Action Items: yes
=== SMOKE TEST PASSED ===
```

Without `LLM_API_KEY`, the test will fail at the analysis stage with `LLM_API_KEY is required for the Anthropic provider` — this is expected.

---

## Useful URLs and Default Credentials

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | Register new user |
| API Docs | http://localhost:8000/docs | — |
| Health Check | http://localhost:8000/healthz | — |
| Readiness Check | http://localhost:8000/readyz | — |
| LocalStack S3 | http://localhost:4566 | minioadmin / minioadmin |
| PostgreSQL | localhost:5432 | meet / meet / meetscribe |
| Redis | localhost:6379 | — |

---

## Environment Variables

### Required Variables

| Name | Example Value | Description |
|------|---------------|-------------|
| `JWT_SECRET` | `dev-secret-key-that-is-at-least-32-bytes-long-for-testing` | **Required**. Secret for signing JWT tokens. Generate with `openssl rand -hex 32`. Must be at least 32 characters. |
| `LLM_API_KEY` | `sk-ant-...` | **Required**. Anthropic API key from [console.anthropic.com](https://console.anthropic.com). Without this, the analysis stage will fail. |

### Database & Cache

| Name | Example Value | Description |
|------|---------------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://meet:meet@localhost:5432/meetscribe` | PostgreSQL async connection string. Uses `meet` user/password created during setup. |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection for Celery broker and result backend. |

### S3 Storage (LocalStack)

| Name | Example Value | Description |
|------|---------------|-------------|
| `S3_ENDPOINT_URL` | `http://localhost:4566` | Internal S3 API endpoint (used by backend/worker for head_object, delete). |
| `S3_PUBLIC_ENDPOINT_URL` | `http://localhost:4566` | Public S3 endpoint for browser presigned URLs. Must be reachable from your browser. |
| `S3_BUCKET` | `meetscribe` | S3 bucket name. Created during LocalStack setup. |
| `S3_ACCESS_KEY` | `minioadmin` | S3 access key (LocalStack default). |
| `S3_SECRET_KEY` | `minioadmin` | S3 secret key (LocalStack default). |
| `S3_REGION` | `us-east-1` | S3 region (LocalStack default). |

> **Note**: For local development with LocalStack, both `S3_ENDPOINT_URL` and `S3_PUBLIC_ENDPOINT_URL` point to `localhost:4566`. In production with real AWS S3, `S3_ENDPOINT_URL` would be empty (uses AWS default) and `S3_PUBLIC_ENDPOINT_URL` would be your S3 bucket URL.

### Transcription Settings

| Name | Example Value | Description |
|------|---------------|-------------|
| `TRANSCRIBER` | `faster_whisper` | Transcription provider: `faster_whisper` (local, default) or `openai` (OpenAI Whisper API). |
| `WHISPER_MODEL` | `small` | Model size for faster-whisper: `tiny`, `base`, `small`, `medium`, `large-v3`. Larger = more accurate but slower/more memory. |
| `WHISPER_DEVICE` | `cpu` | Device for inference: `cpu` or `cuda` (if GPU available). |
| `WHISPER_COMPUTE_TYPE` | `int8` | Compute type for faster-whisper: `int8`, `int8_float16`, `float16`, `float32`. `int8` is fastest on CPU. |
| `TRANSCRIBE_LANGUAGE` | `en` | Optional: Force language (ISO 639-1 code). Empty = auto-detect. |
| `AUDIO_CHUNK_SECONDS` | `1800` | Chunk long audio into N-second windows (default 30 min). Set to 0 to disable chunking. |

### OpenAI Whisper API (when `TRANSCRIBER=openai`)

| Name | Example Value | Description |
|------|---------------|-------------|
| `OPENAI_API_KEY` | `sk-...` | OpenAI API key (required if using OpenAI Whisper). |
| `OPENAI_WHISPER_MODEL` | `whisper-1` | OpenAI Whisper model name. |

### LLM Analysis Settings

| Name | Example Value | Description |
|------|---------------|-------------|
| `LLM_PROVIDER` | `anthropic` | LLM provider: `anthropic` (default) or `openai`. |
| `LLM_MODEL` | `claude-sonnet-4-6` | Model name for the selected provider. |
| `ANALYSIS_TOKEN_BUDGET` | `20000` | Estimated token budget for single-pass analysis. Above this, map-reduce is used. |
| `MAP_WINDOW_SEC` | `600` | Window size in seconds for map-reduce (default 10 min). |

### Pipeline & Upload Settings

| Name | Example Value | Description |
|------|---------------|-------------|
| `MAX_UPLOAD_MB` | `500` | Maximum upload size in MB. |
| `PIPELINE_MAX_RETRIES` | `3` | Max retries for transient pipeline failures. |
| `STUCK_MEETING_MINUTES` | `60` | Minutes before a stuck meeting is marked failed by the beat task. |
| `WORKER_TEMP_DIR` | `/tmp/meetscribe` | Temporary directory for audio processing. |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins for the API. |

### Auth Settings (usually defaults work)

| Name | Example Value | Description |
|------|---------------|-------------|
| `ENV` | `development` | Environment name. |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access token lifetime. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime. |

---

## Generating Secrets

```bash
# Generate a secure JWT_SECRET (run once)
openssl rand -hex 32

# Get Anthropic API key
# Visit: https://console.anthropic.com
```

---

## Complete backend/.env Example

```bash
# backend/.env
ENV=development
DATABASE_URL=postgresql+asyncpg://meet:meet@localhost:5432/meetscribe
REDIS_URL=redis://localhost:6379/0

# Generate with: openssl rand -hex 32
JWT_SECRET=your-generated-32-char-secret-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# LocalStack S3 (started via docker)
S3_ENDPOINT_URL=http://localhost:4566
S3_PUBLIC_ENDPOINT_URL=http://localhost:4566
S3_BUCKET=meetscribe
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1

# Transcription: faster-whisper (local)
TRANSCRIBER=faster_whisper
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
TRANSCRIBE_LANGUAGE=
AUDIO_CHUNK_SECONDS=1800

# OpenAI Whisper (optional, used when TRANSCRIBER=openai)
OPENAI_API_KEY=
OPENAI_WHISPER_MODEL=whisper-1

# Worker
WORKER_TEMP_DIR=/tmp/meetscribe

# LLM: Anthropic (required for analysis)
LLM_PROVIDER=anthropic
LLM_API_KEY=your-anthropic-api-key-here
LLM_MODEL=claude-sonnet-4-6
ANALYSIS_TOKEN_BUDGET=20000
MAP_WINDOW_SEC=600

# Pipeline
MAX_UPLOAD_MB=500
PIPELINE_MAX_RETRIES=3
STUCK_MEETING_MINUTES=60

# CORS
CORS_ORIGINS=http://localhost:5173
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `port already in use` (5432, 6379, 4566, 8000, 5173) | Local PostgreSQL/Redis/LocalStack running | `brew services stop postgresql@16 redis` or `docker stop localstack` |
| LocalStack health check fails | LocalStack takes 30-60s to start | Wait longer; check `docker logs localstack` |
| `ModuleNotFoundError` / import errors | Dependencies not installed | `cd backend && pip install -e ".[dev]"` |
| `alembic: command not found` | Virtual env not activated | `cd backend && source .venv/bin/activate && pip install -e ".[dev]"` |
| Database connection refused | PostgreSQL not running or wrong `DATABASE_URL` | Ensure PostgreSQL running; check `DATABASE_URL` matches setup |
| `npm install` fails | Node modules corrupted | `cd frontend && rm -rf node_modules package-lock.json && npm install` |
| Presigned URL fails | `S3_PUBLIC_ENDPOINT_URL` not reachable from browser | Ensure LocalStack is running on port 4566 |
| Whisper model download slow | First run downloads ~1 GB model | Model caches in `~/.cache/huggingface` |
| Stuck jobs (status stays queued) | Worker not running or crashed | Check worker logs; ensure `LLM_API_KEY` is set |
| Celery task handler error on macOS | Prefork pool not supported | Use `--pool=solo` for worker on macOS |

---

## Stop and Reset

```bash
# Stop processes
pkill -f "uvicorn app.main:app"
pkill -f "celery -A app.workers.celery_app"
pkill -f "npm run dev"

# Stop services
brew services stop postgresql@16 redis

# Remove database
dropdb meetscribe

# Remove LocalStack
docker stop localstack && docker rm localstack
```

---

## Documentation

- `docs/PRD.md` — Product requirements
- `docs/ARCHITECTURE.md` — System design
- `docs/DATABASE.md` — Schema
- `docs/API.md` — REST API
- `docs/PROMPTS.md` — LLM prompts
- `docs/DECISIONS.md` — Design decisions
- `docs/DEPLOYMENT.md` — Deployment guide
- `docs/TASKS.md` — Build plan

---

## License

MIT