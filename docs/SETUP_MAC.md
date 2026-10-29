# Local Setup on macOS (no Docker) — MeetScribe

Target: MacBook with Apple silicon (M2). Everything runs natively. The API uses **port 8000**.

## 1. Ports
| Service | Port |
|---|---|
| API (FastAPI) | **8000** |
| Web app (Vite) | 5173 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API / console | 9000 / 9001 |

**Port 5000 is never used.** macOS reserves it for AirPlay Receiver, so nothing in the project may reference it. `Settings` raises an error if `API_PORT=5000`.
- Check that ports are free: `lsof -nP -iTCP:8000 -iTCP:5173 -iTCP:9000 -iTCP:9001 -sTCP:LISTEN` (no output means free)
- `scripts/check_env.py` performs this check and names the process holding any busy port.
- Port guard: `grep -rnw "5000" backend frontend scripts Makefile Procfile.dev Procfile.local .env.example` must print nothing.

## 2. Files the agent must create

### `.env.example` (copied to `.env`; relative paths resolve against the project root)
```
ENV=development
API_PORT=8000
DATABASE_URL=postgresql+asyncpg://meet:meet@localhost:5432/meetscribe
DATABASE_URL_SYNC=postgresql+psycopg://meet:meet@localhost:5432/meetscribe
TEST_DATABASE_URL=postgresql+asyncpg://meet:meet@localhost:5432/meetscribe_test
TEST_DATABASE_URL_SYNC=postgresql+psycopg://meet:meet@localhost:5432/meetscribe_test
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=change-me
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
CORS_ORIGINS=http://localhost:5173
STORAGE_BACKEND=s3
LOCAL_STORAGE_DIR=.data/uploads
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
S3_ENDPOINT_URL=http://localhost:9000
S3_PUBLIC_ENDPOINT_URL=http://localhost:9000
S3_BUCKET=meetscribe
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
MAX_UPLOAD_MB=500
TRANSCRIBER=faster_whisper
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
LLM_PROVIDER=anthropic
LLM_API_KEY=
LLM_MODEL=claude-sonnet-5-5
REAPER_STALE_MINUTES=15
MAX_PROCESS_ATTEMPTS=3
```

### `Procfile.dev` (used by `make dev`, run by `honcho`, which loads `.env`)
```
minio: minio server .data/minio --address :9000 --console-address :9001
api: cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
worker: cd backend && .venv/bin/celery -A app.workers.celery_app worker --pool=solo --loglevel=info
beat: cd backend && .venv/bin/celery -A app.workers.celery_app beat --loglevel=info
frontend: cd frontend && npm run dev
```
`Procfile.local` is the same without the `minio` line (used by `make dev-local` with `STORAGE_BACKEND=local`). `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` come from `.env`.

### `Makefile` targets (recipe lines must be indented with a TAB)
| Target | Does |
|---|---|
| `setup` | runs `scripts/setup_mac.sh` |
| `check` | `backend/.venv/bin/python scripts/check_env.py` |
| `dev` / `dev-local` | `backend/.venv/bin/honcho start -f Procfile.dev` / `Procfile.local` |
| `minio` | runs MinIO in the foreground |
| `minio-bg` / `stop` | starts MinIO in background (pid in `.data/minio.pid`) / stops it |
| `bucket` | `backend/.venv/bin/python scripts/init_storage.py` |
| `warm-whisper` | downloads the configured Whisper model into the Hugging Face cache |
| `migrate` | `cd backend && .venv/bin/alembic upgrade head` |
| `test-backend` | `cd backend && .venv/bin/pytest -q` |
| `test-frontend` | `cd frontend && npm test -- --run` |
| `e2e` | `cd frontend && npx playwright test` |
| `test` | all three above |
| `smoke` | `backend/.venv/bin/python scripts/smoke_test.py` |
| `lint` | ruff check, ruff format --check, mypy, eslint, tsc |
| `reset` | drop and recreate `meetscribe` DB, run migrations, clear `.data/` (asks for confirmation) |

### `scripts/setup_mac.sh` (idempotent, `set -euo pipefail`)
1. Verify Homebrew exists, else print install link and exit.
2. `brew install` any missing of: `python@3.11 node postgresql@16 redis ffmpeg minio`.
3. Ensure `/opt/homebrew/opt/postgresql@16/bin` is on PATH (append to `~/.zshrc` if missing, export for this run).
4. `brew services start postgresql@16 redis`; wait until `pg_isready` succeeds.
5. Create role `meet` (password `meet`, CREATEDB) and databases `meetscribe`, `meetscribe_test` only if missing.
6. Copy `.env.example` to `.env` if missing; generate `JWT_SECRET` with `openssl rand -hex 32` (use `sed -i ''` on macOS).
7. Create `backend/.venv` with `python3.11`, upgrade pip, `pip install -e ".[dev]"`.
8. `npm install` in `frontend/`, then `npx playwright install chromium`.
9. `alembic upgrade head`.
10. If `STORAGE_BACKEND=s3`: start MinIO in background and create the bucket.
11. Download the Whisper model (`make warm-whisper`).
12. Print next steps: set `LLM_API_KEY`, run `make check`, then `make dev`.

### `scripts/check_env.py`
Prints PASS/FAIL with a fix hint for each of: Python 3.11 venv, Node 20+, ffmpeg and ffprobe, PostgreSQL reachable and both databases exist, Alembic at head, Redis ping, required ports free (8000, 5173, 9000, 9001) or held by our own processes, naming any other holder; fail if `API_PORT` is 5000 or if the port guard grep finds 5000, storage reachable (bucket exists or local dir writable), Whisper model cached, `LLM_API_KEY` set when `LLM_PROVIDER=anthropic`. Exit code 1 if any FAIL.

### `scripts/init_storage.py`
Creates the bucket if missing (boto3 against `S3_ENDPOINT_URL`), sets nothing else. No-op in `local` mode (creates `.data/uploads`).

### `scripts/make_sample_audio.sh`
Uses macOS `say` and ffmpeg to create `.data/sample/meeting_sample.mp3` from the spoken script in `docs/TESTING.md`.

## 3. Daily workflow
```bash
# project root
brew services list           # postgresql@16 and redis should be "started"
make dev                     # starts everything
```
Open http://localhost:5173. Stop with Ctrl+C.

## 4. Switching to real AWS S3 (optional)
Set `S3_ENDPOINT_URL=` and `S3_PUBLIC_ENDPOINT_URL=` (empty), real keys, bucket, region, and add bucket CORS allowing `PUT, GET, HEAD` from `http://localhost:5173` with `ExposeHeaders: ETag`. Use `make dev-local`-style Procfile without MinIO.

## 5. Whisper model choice on M2
| Model | Download | Speed on CPU (int8) | Use |
|---|---|---|---|
| `base` | ~150 MB | fast | development |
| `small` | ~500 MB | moderate (default) | good accuracy |
| `medium` | ~1.5 GB | slow | best accuracy, needs 16 GB RAM |
