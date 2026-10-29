# MeetScribe

Upload a meeting recording and get a transcript, a concise summary, key decisions, and a structured list of action items. Transcription and analysis run in the background, so uploads never block.

Runs directly on macOS (no Docker). API on **http://localhost:8000**, web app on **http://localhost:5173**.

## Features
**Product**
- Sign up and log in (JWT), each user sees only their own meetings
- Upload mp3, wav, m4a, mp4, webm, ogg (up to 500 MB), straight to S3/MinIO via presigned URL
- Background pipeline: ffmpeg normalize, Whisper transcription with timestamps, LLM analysis
- Summary, key points, decisions, suggested title
- Action items with owner, due date, priority, and a link back to the transcript moment
- Long meetings handled with chunking and map-reduce summarization
- Search, filter, edit, complete, delete, retry failed jobs, export to Markdown and PDF
- Crash recovery: stuck jobs are detected and re-queued automatically

**Interface**
- Light and dark themes, command palette (Cmd+K), keyboard shortcuts
- Dashboard with stats and charts, animated upload queue, live processing step tracker
- Meeting page with tabs, audio player with waveform and speed control, follow-along transcript with search
- Action items in list or kanban view, global "My action items" page
- Fully responsive and keyboard accessible

## Architecture
```
Browser ──PUT (presigned)──▶ MinIO / S3                (localhost:9000)
   │                              ▲
   └──REST──▶ FastAPI :8000 ──▶ PostgreSQL :5432
                 │
                 └─enqueue─▶ Redis :6379 ─▶ Celery worker (--pool=solo)
                                              ├─ ffmpeg: normalize / chunk
                                              ├─ faster-whisper: transcribe
                                              └─ LLM: summary + action items
                             Celery beat ─▶ reaper (re-queues stuck jobs)
```
Details: `docs/ARCHITECTURE.md`.

## Prerequisites (macOS on Apple silicon)
| Tool | Version | Check |
|---|---|---|
| macOS | 13 or newer | `sw_vers` |
| Homebrew | any | `brew --version` |
| Python | 3.11 | `python3.11 --version` |
| Node.js | 20 or newer | `node --version` |
| PostgreSQL | 16 | `psql --version` |
| Redis | 7 or newer | `redis-server --version` |
| ffmpeg | 6 or newer | `ffmpeg -version` |
| MinIO (optional) | any | `minio --version` |
| LLM API key | Anthropic | needed for the analysis step |

RAM: 8 GB minimum; Whisper `small` needs about 2 GB free. Use `WHISPER_MODEL=base` on tight machines.

## Setup

### Step 0: check that the ports are free
The project uses ports 8000 (API), 5173 (web app), 5432, 6379, 9000, 9001. It never uses port 5000, which macOS reserves for AirPlay Receiver.

**Run in:** any directory
```bash
lsof -nP -iTCP:8000 -iTCP:5173 -iTCP:9000 -iTCP:9001 -sTCP:LISTEN
```
It should print nothing before you start the app. If something is listed, stop that process or ask `make check` which one it is.

### Option 1: automated setup (recommended)
**Run in:** `meetscribe/` (project root)
```bash
chmod +x scripts/*.sh
./scripts/setup_mac.sh
```
It installs missing Homebrew packages, starts PostgreSQL and Redis, creates the database, creates `backend/.venv`, installs backend and frontend dependencies, creates `.env`, runs migrations, creates the storage bucket, and downloads the Whisper model. Then edit `.env` and set `LLM_API_KEY`.

### Option 2: manual setup
**1. Install tools.** Run in: any directory
```bash
brew install python@3.11 node postgresql@16 redis ffmpeg minio
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```
**2. Start database and cache.** Run in: any directory
```bash
brew services start postgresql@16
brew services start redis
```
**3. Create the database.** Run in: any directory
```bash
psql postgres -c "CREATE USER meet WITH PASSWORD 'meet' CREATEDB;"
createdb -O meet meetscribe
createdb -O meet meetscribe_test
```
**4. Configure environment.** Run in: `meetscribe/` (project root)
```bash
cp .env.example .env
```
Open `.env` and set `LLM_API_KEY=<your-anthropic-key>`.

**5. Backend dependencies and migrations.** Run in: `meetscribe/backend/`
```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
```
**6. Frontend dependencies.** Run in: `meetscribe/frontend/`
```bash
npm install
```
**7. Create storage bucket.** Run in: `meetscribe/` (project root)
```bash
make minio-bg      # starts MinIO in the background
make bucket        # creates the bucket
```
No MinIO? Set `STORAGE_BACKEND=local` in `.env` and skip this step.

**8. Pre-download the Whisper model.** Run in: `meetscribe/` (project root)
```bash
make warm-whisper
```

## Run the app

### One command
**Run in:** `meetscribe/` (project root). Stays running; Ctrl+C stops everything.
```bash
make dev          # MinIO + API + worker + beat + frontend
# or, with STORAGE_BACKEND=local:
make dev-local
```

### Or one terminal per process
**Terminal 1: MinIO.** Run in: `meetscribe/`
```bash
make minio
```
**Terminal 2: API (port 8000).** Run in: `meetscribe/backend/`
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
**Terminal 3: worker.** Run in: `meetscribe/backend/`
```bash
source .venv/bin/activate
celery -A app.workers.celery_app worker --pool=solo --loglevel=info
```
**Terminal 4: beat.** Run in: `meetscribe/backend/`
```bash
source .venv/bin/activate
celery -A app.workers.celery_app beat --loglevel=info
```
**Terminal 5: frontend.** Run in: `meetscribe/frontend/`
```bash
npm run dev
```

## Verify it works
**Run in:** `meetscribe/` (project root), with the app running in another terminal
```bash
make check     # environment and service checks
make smoke     # full end-to-end run with a generated spoken sample
```
`make smoke` registers a user, uploads a spoken sample, waits for processing, and checks the transcript, summary, and action items. Every line should print `PASS`.

## Run the tests
**Run in:** `meetscribe/` (project root)
```bash
make test-backend    # pytest, uses fake Whisper and fake LLM
make test-frontend   # Vitest
make e2e             # Playwright browser tests (starts its own stack)
make test            # all of the above
```
The full feature-by-feature test plan is in `docs/TESTING.md`.

## URLs
| What | URL |
|---|---|
| Web app | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Health / readiness | http://localhost:8000/healthz, /readyz |
| MinIO console | http://localhost:9001 (minioadmin / minioadmin) |

## Environment variables (`.env` in project root)
| Variable | Example | Required | Purpose |
|---|---|---|---|
| `API_PORT` | `8000` | yes | API port (5000 is rejected) |
| `DATABASE_URL` | `postgresql+asyncpg://meet:meet@localhost:5432/meetscribe` | yes | API database connection |
| `DATABASE_URL_SYNC` | `postgresql+psycopg://meet:meet@localhost:5432/meetscribe` | yes | Worker and Alembic |
| `REDIS_URL` | `redis://localhost:6379/0` | yes | Celery broker |
| `JWT_SECRET` | long random string | yes | Token signing |
| `STORAGE_BACKEND` | `s3` or `local` | yes | Storage mode |
| `S3_ENDPOINT_URL` | `http://localhost:9000` | s3 mode | Server-side endpoint |
| `S3_PUBLIC_ENDPOINT_URL` | `http://localhost:9000` | s3 mode | Host used in presigned URLs |
| `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_REGION` | `meetscribe` / `minioadmin` / `minioadmin` / `us-east-1` | s3 mode | Bucket credentials |
| `TRANSCRIBER` | `faster_whisper`, `openai`, `fake` | yes | Transcription provider |
| `WHISPER_MODEL` | `small` | no | `tiny`, `base`, `small`, `medium` |
| `LLM_PROVIDER` | `anthropic` or `fake` | yes | Analysis provider |
| `LLM_API_KEY` | your key | for real analysis | LLM credentials |
| `LLM_MODEL` | `claude-sonnet-5-5` | no | Model name |
| `CORS_ORIGINS` | `http://localhost:5173` | yes | Allowed web origin |
| `REAPER_STALE_MINUTES` | `15` | no | Idle time before a job is re-queued |

## Troubleshooting
| Problem | Fix |
|---|---|
| `address already in use` on port 8000 | Another process holds the port. Find it with `lsof -nP -iTCP:8000 -sTCP:LISTEN` and stop it, or run `make check` |
| `psql: command not found` | Add PostgreSQL to PATH (setup step 1), open a new terminal |
| `role "meet" does not exist` | Re-run setup step 3 |
| `Connection refused` on 6379 or 5432 | `brew services start redis postgresql@16`; check with `brew services list` |
| Meeting stays "queued" forever | Worker is not running; start Terminal 3 |
| First transcription is very slow | Whisper model is downloading; run `make warm-whisper` once |
| Browser upload fails with CORS or signature error | `S3_PUBLIC_ENDPOINT_URL` must match the host the browser uses; restart MinIO and API after changing it |
| `externally-managed-environment` from pip | You are outside the venv; run `source backend/.venv/bin/activate` |
| Worker crashes with fork or `objc` errors | Use `--pool=solo` (already in the Makefile and Procfile) |
| `ffmpeg: command not found` | `brew install ffmpeg` |

## Stop and reset
**Run in:** `meetscribe/` (project root)
```bash
# Ctrl+C in the terminal running `make dev`
make stop          # stops background MinIO
make reset         # drops and recreates the database, clears .data/
brew services stop postgresql@16 redis    # optional: stop system services
```

## Project docs
`AGENTS.md` (agent rules), `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/PROMPTS.md`, `docs/UI.md`, `docs/SETUP_MAC.md`, `docs/TESTING.md`, `docs/TASKS.md`.
