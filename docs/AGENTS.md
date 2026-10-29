# AGENTS.md — MeetScribe (Meeting Notes Summarizer)

OpenCode reads this file automatically. Follow it for every task in this repo.

## Project summary
MeetScribe lets a user upload a meeting recording, transcribes it with Whisper, then uses an LLM to produce a summary, key decisions, and action items (owner, due date, priority). Heavy work runs asynchronously in a background worker. Audio lives in S3-compatible storage.

**Runtime target: macOS (Apple silicon, MacBook M2), run directly on the machine. NO Docker anywhere in this project.** Do not create Dockerfiles, docker-compose files, or Docker instructions.

**The API server listens on port 8000.** Frontend dev server: 5173. **Port 5000 must never be used anywhere in this project** (code, config, scripts, tests, docs): macOS uses it for AirPlay Receiver. `Settings` must raise an error if `API_PORT` is 5000.

Read these before coding, in order: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/PROMPTS.md`, `docs/UI.md`, `docs/SETUP_MAC.md`, `docs/TESTING.md`, `docs/TASKS.md`.

## Tech stack (do not change without asking)
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, pydantic-settings
  - API uses async SQLAlchemy (`asyncpg`); Celery tasks and Alembic use the sync driver (`psycopg`)
- Worker: Celery 5 + Redis (broker and result backend), plus Celery beat
- Database: PostgreSQL 16 (Homebrew)
- Storage: `STORAGE_BACKEND=s3` (MinIO locally via Homebrew, or real AWS S3) or `STORAGE_BACKEND=local` (dev-only filesystem fallback). Both sit behind one `StorageService` interface.
- Transcription: `faster-whisper` (CPU, int8) behind a `Transcriber` interface; optional OpenAI Whisper API provider; `fake` provider for tests
- LLM: `LLMClient` interface; default Anthropic (`LLM_MODEL=claude-sonnet-5-5`); `fake` provider for tests and offline pipeline checks
- Audio: ffmpeg/ffprobe (normalize to 16 kHz mono WAV, chunk long files)
- PDF export: reportlab (pure Python, no system libs)
- Frontend: React 18 + Vite + TypeScript (strict), Tailwind, TanStack Query, React Router, Radix UI, framer-motion, lucide-react, Recharts, wavesurfer.js
- Tests: pytest, pytest-asyncio, httpx, moto (backend); Vitest + React Testing Library + Playwright (frontend)
- Dev process runner: `honcho` + `Procfile.dev`, plus `Makefile`

## Repo layout
```
meetscribe/
├── AGENTS.md  README.md  Makefile  Procfile.dev  Procfile.local  .env.example  .gitignore
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/          # config, security, logging, rate limit
│   │   ├── db/            # session, base, models
│   │   ├── api/v1/        # auth, meetings, action_items, dev_storage, system
│   │   ├── schemas/
│   │   ├── services/      # storage, audio, transcription, llm, prompts, analysis, export
│   │   └── workers/       # celery_app, tasks, reaper
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/{api,components/ui,components,pages,hooks,lib,styles}
│   ├── e2e/               # Playwright
│   └── package.json
├── scripts/               # setup_mac.sh, check_env.py, init_storage.py, smoke_test.py, make_sample_audio.sh
├── .data/                 # local MinIO data, local-storage files (git-ignored)
└── docs/
```

## Commands (run from project root unless noted)
- First-time setup: `./scripts/setup_mac.sh`
- Check environment: `make check`
- Start everything: `make dev` (MinIO, API :8000, worker, beat, frontend :5173)
- Start without MinIO (local storage mode): `make dev-local`
- Backend tests: `make test-backend`; frontend unit tests: `make test-frontend`; E2E: `make e2e`
- All tests: `make test`
- Smoke test against running stack: `make smoke`
- Lint and types: `make lint` (ruff, mypy, eslint, tsc)
- Migrations: `cd backend && source .venv/bin/activate && alembic revision --autogenerate -m "msg" && alembic upgrade head`
- Reset local data: `make reset`

## Coding rules
1. Type hints everywhere in Python; strict TypeScript, no `any`.
2. Routers stay thin; logic lives in `services/`. Workers call services, never routers.
3. S3, Whisper, and the LLM are reached only through interfaces in `services/` so they can be faked in tests.
4. No secrets in code. All config via `app/core/config.py` from env vars; `.env.example` documents every variable.
5. In `s3` mode audio never passes through the API server (presigned URLs). `local` mode is a documented dev-only exception.
6. Celery tasks must be idempotent and safe to run twice; use `acks_late=True`, bounded retries with backoff for transient errors only.
7. LLM output is requested as JSON and validated with Pydantic; retry once with the validation error, then fail.
8. Every meeting and action-item route checks ownership. Other users get 404.
9. Every endpoint and service gets tests. Never mark a task done with failing tests.
10. Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`), small and frequent.
11. Frontend changes may only use endpoints documented in `docs/API.md`.

## macOS specifics (must be handled)
- Never use port 5000 (reserved by macOS AirPlay Receiver). Fixed ports: API 8000, frontend 5173, PostgreSQL 5432, Redis 6379, MinIO 9000 and 9001. `scripts/check_env.py` must FAIL if `API_PORT` is 5000, if anything config-related references port 5000, or if a required port is already taken by another process (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) and print which process holds it.
- Run Celery with `--pool=solo` (Whisper is CPU heavy and prefork is unsafe on macOS with native libs).
- Homebrew paths: `/opt/homebrew/bin`; `postgresql@16` and `node@` formulas are keg-only and need PATH entries.
- Use `python3.11 -m venv backend/.venv`; never `pip install` globally.

## Working agreement for the agent
- Work one phase of `docs/TASKS.md` at a time; each phase has a **verification gate**. A phase is not done until every gate command was actually run and passed.
- Never claim something works without running it. Report commands and real output.
- Before large changes, state a short plan. Record non-obvious assumptions in `docs/DECISIONS.md`.
- Do not add dependencies without a one-line justification in the phase report.
- Port guard: `grep -rnw "5000" backend frontend scripts Makefile Procfile.dev Procfile.local .env.example` must print nothing.
- Never commit `.env`, `.data/`, audio files, or model weights.
- If a command fails twice for the same reason, stop and ask with the exact error and two options.

## Definition of done (per task)
- Implemented and typed
- Tests written and passing (`make test`)
- `make lint` clean
- Docs updated if behavior or API changed
- Works end to end under `make dev` on port 8000
