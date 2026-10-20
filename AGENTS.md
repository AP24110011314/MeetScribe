# AGENTS.md — MeetScribe (Meeting Notes Summarizer)

OpenCode reads this file automatically. Follow it for every task in this repo.

## Project summary
MeetScribe lets a user upload a meeting recording, transcribes it with Whisper, then uses an LLM to produce a summary, key decisions, and action items (owner, due date, priority). Heavy work runs asynchronously in background workers. Audio is stored in S3-compatible storage.

Read these before coding (in order): `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/TASKS.md`.

## Tech stack (do not change without asking)
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2
- Worker: Celery 5 + Redis (broker and result backend)
- Database: PostgreSQL 16
- Storage: S3 (MinIO locally, AWS S3 in production) via boto3, presigned URLs
- Transcription: faster-whisper (default, local) behind a `Transcriber` interface; OpenAI Whisper API as optional provider
- LLM: provider interface `LLMClient`; default Anthropic API, configurable by env
- Audio processing: ffmpeg (normalize to 16 kHz mono WAV, chunk long files)
- Frontend: React 18 + Vite + TypeScript, TanStack Query, React Router, Tailwind CSS
- Tests: pytest + pytest-asyncio + httpx (backend), Vitest + React Testing Library (frontend)
- Infra: Docker Compose for local dev, GitHub Actions for CI

## Repo layout
```
meetscribe/
├── AGENTS.md
├── README.md
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/            # config, security, logging
│   │   ├── db/              # session, base, models
│   │   ├── api/v1/          # routers: auth, meetings, action_items
│   │   ├── schemas/         # pydantic models
│   │   ├── services/        # storage, transcription, llm, audio, export
│   │   └── workers/         # celery app + tasks
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/{api,components,pages,hooks,lib}
│   └── package.json
└── docs/
```

## Commands
- Start everything: `docker compose up --build`
- Backend tests: `cd backend && pytest -q`
- Lint/format backend: `ruff check . && ruff format .`
- Type check backend: `mypy app`
- Migrations: `alembic revision --autogenerate -m "msg"` then `alembic upgrade head`
- Frontend dev: `cd frontend && npm run dev`
- Frontend tests: `npm test`; lint: `npm run lint`; typecheck: `npm run typecheck`

## Coding rules
1. Type hints everywhere in Python; strict TypeScript, no `any`.
2. Routers stay thin; business logic lives in `services/`. Workers call services, never routers.
3. External systems (S3, Whisper, LLM) are accessed only through interfaces in `services/` so they can be mocked in tests.
4. Never read secrets from code. All config via `app/core/config.py` (pydantic-settings) from env vars.
5. Never upload audio through the API server. Use presigned S3 URLs (browser uploads straight to S3).
6. All Celery tasks must be idempotent and retry-safe (`acks_late=True`, bounded retries with backoff).
7. LLM output must be requested as JSON and validated with Pydantic; retry once with the validation error on failure.
8. Every endpoint checks ownership: a user can only access their own meetings.
9. Every new endpoint or service gets tests. Do not mark a task done with failing tests.
10. Small commits, conventional commit messages (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).

## Working agreement for the agent
- Work one phase from `docs/TASKS.md` at a time. After finishing, tick the checkboxes in that file.
- Before large changes, state a short plan. After changes, run tests and lint and report results.
- If a requirement is ambiguous, pick the simplest option consistent with the docs and note the assumption in `docs/DECISIONS.md` (create if missing).
- Do not add dependencies without a one-line justification.
- Never commit `.env`, audio files, or model weights.

## Definition of done (per task)
- Code implemented and typed
- Tests written and passing
- Lint and type checks clean
- Docs updated if behavior or API changed
- Works end to end under `docker compose up`
