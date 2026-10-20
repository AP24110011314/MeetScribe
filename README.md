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

| Tool | Version | Check Command | Docker Path | No-Docker Path |
|------|---------|---------------|-------------|----------------|
| Docker Desktop | 4.x+ | `docker --version` | ✅ Required | ❌ |
| Docker Compose | 2.x+ | `docker compose version` | ✅ Required | ❌ |
| Git | 2.x+ | `git --version` | ✅ Required | ✅ Required |
| Python | 3.11 | `python3.11 --version` | ❌ | ✅ Required |
| Node.js | 20+ | `node --version` | ❌ | ✅ Required |
| PostgreSQL | 16 | `psql --version` | ❌ | ✅ Required |
| Redis | 7+ | `redis-cli --version` | ❌ | ✅ Required |
| ffmpeg | 6+ | `ffmpeg -version` | ✅ In container | ✅ Required |
| MinIO / LocalStack | — | — | ✅ In container | ✅ Required (via Docker) |

**Minimum RAM**: 4 GB for Docker (Whisper `small` model ~2 GB); 8 GB recommended for local Whisper.

---

## Option A: Run with Docker (Recommended)

This is the easiest way to run the full stack including all dependencies.

### 1. Clone the repository

**Run in:** `meetscribe/` (project root)
```bash
git clone https://github.com/your-org/meetscribe.git
cd meetscribe
```

### 2. Configure environment variables

**Run in:** `meetscribe/` (project root)
```bash
cp .env.example .env
```

Edit `.env` and set **at minimum**:
- `LLM_API_KEY` — Your Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))
- `JWT_SECRET` — A strong random string (generate with `openssl rand -hex 32`)

> **Note**: The default `.env.example` has sensible defaults for local Docker development. You only need to change `LLM_API_KEY` and `JWT_SECRET` to get started.

### 3. Start all services

**Run in:** `meetscribe/` (project root)
```bash
docker compose up --build
```

This will start (in order):
1. **PostgreSQL** on port 5432
2. **Redis** on port 6379
3. **LocalStack (S3)** on ports 9000 (S3 API) and 9001 (console)
4. **Migrate** (one-shot: runs `alembic upgrade head`)
5. **Backend API** on port 8000
6. **Celery Worker** (background processing)
7. **Celery Beat** (scheduled tasks)
8. **Frontend** on port 5173

### 4. Access the application

| Service | URL |
|---------|-----|
| **Frontend (UI)** | http://localhost:5173 |
| **API Docs (Swagger)** | http://localhost:8000/docs |
| **API Health Check** | http://localhost:8000/healthz |
| **API Readiness Check** | http://localhost:8000/readyz |
| **MinIO Console** | http://localhost:9001 (user: `minioadmin`, pass: `minioadmin`) |

### 5. Create an account and start using MeetScribe

1. Open http://localhost:5173
2. Click **Register** to create an account
3. Log in and upload a meeting recording (mp3, wav, m4a, mp4, webm, ogg — up to 500 MB)
4. Wait for processing (status updates in real-time)
5. View the transcript, summary, decisions, and action items

### 6. Stop the application

**Run in:** `meetscribe/` (project root)
```bash
# Stop containers (preserves data)
docker compose down

# Stop and remove all data (database, S3 uploads, etc.)
docker compose down -v
```

---

## Option B: Run without Docker (Local Development)

Use this if you want to run the backend/frontend directly on your machine for faster iteration.

**Assumes:** macOS on Apple Silicon (M2) with Homebrew.

### 1. Stop any conflicting Docker containers

```bash
docker compose down -v 2>/dev/null || true
```

### 2. Install prerequisites

**Run in:** `meetscribe/` (project root)
```bash
# Homebrew packages
brew install python@3.11 node@20 postgresql@16 redis ffmpeg

# Start services
brew services start postgresql@16 redis
```

### 3. Create database and user

```bash
# Create database (adjust username if needed)
createdb -U $(whoami) meetscribe

# Create DB user and grant privileges
psql -U $(whoami) -d meetscribe -c "CREATE USER meet WITH PASSWORD 'meet';"
psql -U $(whoami) -d meetscribe -c "GRANT ALL PRIVILEGES ON DATABASE meetscribe TO meet;"
psql -U $(whoami) -d meetscribe -c "ALTER USER meet CREATEDB;"
```

### 4. Start LocalStack (S3) via Docker

**Terminal 1** (stays running):
```bash
docker run -d --name localstack -p 4566:4566 -p 4510-4559:4510-4559 \
  -e SERVICES=s3 -e DEFAULT_REGION=us-east-1 -e S3_SKIP_SIGNATURE_VALIDATION=1 \
  localstack/localstack:3.8
```

Create the bucket:
```bash
# Wait ~10s for LocalStack to start, then:
AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin \
aws --endpoint-url=http://localhost:4566 s3 mb s3://meetscribe
```

### 5. Set up the backend

**Run in:** `meetscribe/backend/`
```bash
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

### 6. Start each process in its own terminal

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

### 7. Set up the frontend

**Run in:** `meetscribe/frontend/`
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### 8. Access the application

| Service | URL |
|---------|-----|
| **Frontend (UI)** | http://localhost:5173 |
| **API Docs (Swagger)** | http://localhost:8000/docs |
| **API Health Check** | http://localhost:8000/healthz |
| **API Readiness Check** | http://localhost:8000/readyz |

### Key differences from Docker

| Variable | Docker | No-Docker |
|----------|--------|-----------|
| `DATABASE_URL` | `postgresql+asyncpg://meet:meet@postgres:5432/meetscribe` | `postgresql+asyncpg://meet:meet@localhost:5432/meetscribe` |
| `REDIS_URL` | `redis://redis:6379/0` | `redis://localhost:6379/0` |
| `S3_ENDPOINT_URL` | `http://localstack:4566` | `http://localhost:4566` |
| `S3_PUBLIC_ENDPOINT_URL` | `http://localhost:9000` | `http://localhost:4566` |
| Celery pool | `prefork` (default) | `--pool=solo` (macOS workaround) |

---

## Run the Tests

### Backend tests (Docker)

**Run in:** `meetscribe/` (project root)
```bash
docker compose up -d
docker compose exec api pip install -e ".[dev]" -q
docker compose exec api python -m pytest -q
```

### Backend tests (No-Docker)

**Run in:** `meetscribe/backend/`
```bash
source .venv/bin/activate
TEST_DATABASE_URL=postgresql+asyncpg://meet:meet@localhost:5432/meetscribe_test \
JWT_SECRET=test-secret-key-that-is-at-least-32-bytes-long-for-testing \
pytest -q
```

### Frontend tests

**Run in:** `meetscribe/frontend/`
```bash
npm test
```

### Lint & Type Check

**Backend** (from `backend/`):
```bash
ruff check . && ruff format . && mypy app
```

**Frontend** (from `frontend/`):
```bash
npm run lint && npm run typecheck
```

---

## Verify It Works

Use the smoke test script to run an end-to-end test:

**Run in:** `meetscribe/` (project root)
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
| MinIO Console (Docker) | http://localhost:9001 | minioadmin / minioadmin |
| LocalStack S3 (No-Docker) | http://localhost:4566 | minioadmin / minioadmin |
| PostgreSQL | localhost:5432 | meet / meet / meetscribe |
| Redis | localhost:6379 | — |

---

## Environment Variables

| Name | Example Value | Required | Description | Docker vs No-Docker |
|------|---------------|----------|-------------|---------------------|
| `ENV` | `development` | No | Environment name | Same |
| `DATABASE_URL` | `postgresql+asyncpg://meet:meet@postgres:5432/meetscribe` | Yes | PostgreSQL connection string | Host: `postgres` (Docker) vs `localhost` (local) |
| `REDIS_URL` | `redis://redis:6379/0` | Yes | Redis connection string | Host: `redis` (Docker) vs `localhost` (local) |
| `JWT_SECRET` | `dev-secret-key-...` | **Yes** | Secret for JWT signing | Same (use strong value) |
| `JWT_ALGORITHM` | `HS256` | No | JWT algorithm | Same |
| `S3_ENDPOINT_URL` | `http://localstack:4566` | Yes | S3 API endpoint (internal) | `localstack:4566` (Docker) vs `localhost:4566` (local) |
| `S3_PUBLIC_ENDPOINT_URL` | `http://localhost:9000` | Yes | S3 URL for browser presigned URLs | `localhost:9000` (Docker) vs `localhost:4566` (local) |
| `S3_BUCKET` | `meetscribe` | Yes | S3 bucket name | Same |
| `S3_ACCESS_KEY` | `minioadmin` | Yes | S3 access key | Same |
| `S3_SECRET_KEY` | `minioadmin` | Yes | S3 secret key | Same |
| `S3_REGION` | `us-east-1` | Yes | S3 region | Same |
| `TRANSCRIBER` | `faster_whisper` | No | `faster_whisper` or `openai` | Same |
| `WHISPER_MODEL` | `small` | No | Model size (tiny/base/small/medium/large-v3) | Same |
| `WHISPER_DEVICE` | `cpu` | No | `cpu` or `cuda` | Same |
| `WHISPER_COMPUTE_TYPE` | `int8` | No | Compute type for faster-whisper | Same |
| `LLM_PROVIDER` | `anthropic` | No | `anthropic` or `openai` | Same |
| `LLM_API_KEY` | `sk-ant-...` | **Yes** | Anthropic/OpenAI API key | Same |
| `LLM_MODEL` | `claude-sonnet-4-6` | No | LLM model name | Same |
| `MAX_UPLOAD_MB` | `500` | No | Max upload size in MB | Same |
| `CORS_ORIGINS` | `http://localhost:5173` | No | Allowed CORS origins | Same |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `port already in use` (5432, 6379, 9000, 8000, 5173) | Local PostgreSQL/Redis/MinIO running | `brew services stop postgresql@16 redis` or `docker stop postgres redis minio` |
| LocalStack health check fails | LocalStack takes 30-60s to start | Wait longer; check `docker compose logs -f localstack` |
| `ModuleNotFoundError` / import errors | Dependencies not installed | `cd backend && pip install -e ".[dev]"` |
| `alembic: command not found` | Virtual env not activated | `cd backend && source .venv/bin/activate && pip install -e ".[dev]"` |
| Database connection refused | PostgreSQL not running or wrong `DATABASE_URL` | Ensure PostgreSQL running; check `DATABASE_URL` matches setup |
| `npm install` fails | Node modules corrupted | `cd frontend && rm -rf node_modules package-lock.json && npm install` |
| Presigned URL fails | `S3_PUBLIC_ENDPOINT_URL` not reachable from browser | Docker: `http://localhost:9000`; Local: `http://localhost:4566` |
| Whisper model download slow | First run downloads ~1 GB model | Use named volume for model cache (Docker); model caches in `~/.cache/huggingface` (local) |
| ARM/Apple silicon build issues | Some wheels not available | Use `python:3.11-slim` base image; all deps now have arm64 wheels |
| Docker out of memory | Whisper model + containers exceed RAM | Increase Docker Desktop memory to 6+ GB; or use `TRANSCRIBER=openai` |
| Stuck jobs (status stays queued) | Worker not running or crashed | Check `docker compose logs worker`; ensure `LLM_API_KEY` is set |
| Celery task handler error on macOS | Prefork pool not supported | Use `--pool=solo` for worker on macOS |

---

## Stop and Reset

### Docker
```bash
# Stop (keep data)
docker compose down

# Full reset (wipe everything)
docker compose down -v
```

### No-Docker
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