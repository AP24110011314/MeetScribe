# Build Plan — MeetScribe

Work one phase at a time. A phase is done only when every **gate** command was run and passed. Tick boxes here and commit after each phase. Record results in `docs/TEST_REPORT.md` as you go.

## Phase 0: Scaffold and environment
- [x] Repo layout from AGENTS.md, `.gitignore` (`.env`, `.data/`, `.venv`, `node_modules`)
- [x] `.env.example`, `Makefile`, `Procfile.dev`, `Procfile.local`, `scripts/setup_mac.sh`, `scripts/check_env.py`, `scripts/init_storage.py`
- [x] FastAPI app with `/healthz`, config via pydantic-settings, runs on port 8000; `Settings` rejects `API_PORT=5000`
- [x] Alembic, ruff, mypy, pytest configured; Vite + React + TS + Tailwind app with `/api` proxy
- [x] **Gate:** `./scripts/setup_mac.sh` completes; `make check` all PASS; `make dev` starts; `curl localhost:8000/healthz` returns ok; `grep -rnw "5000" backend frontend scripts Makefile Procfile.dev Procfile.local .env.example` prints nothing; `http://localhost:5173` loads

## Phase 1: Data model and auth (F01, F21, F22)
- [ ] Models and migration exactly per `docs/DATABASE.md`
- [ ] Register, login, refresh, me; argon2; JWT; rate limit on auth
- [ ] `get_current_user` and `get_owned_meeting` dependencies
- [ ] **Gate:** `pytest tests/test_auth.py tests/test_isolation.py tests/test_rate_limit.py` pass; manual curl register and login on port 8000

## Phase 2: Storage and upload (F02)
- [ ] `StorageService` with `s3` (boto3, presign, head, delete) and `local` backends, dev-storage routes
- [ ] `POST /meetings`, `POST /meetings/{id}/complete` with validation
- [ ] **Gate:** `pytest tests/test_upload.py tests/test_storage_local.py` pass; real PUT of a file to MinIO via presigned URL verified with curl; same in `local` mode

## Phase 3: Async pipeline skeleton (F03, F19)
- [ ] Celery app, `process_meeting` with stub stages, status and progress updates, jobs rows
- [ ] `acks_late`, retries, claim-by-UPDATE idempotency, reaper beat task
- [ ] `GET /meetings/{id}/status`
- [ ] **Gate:** `pytest tests/test_pipeline.py tests/test_reaper.py` pass; with `make dev` an uploaded file moves queued → done via stubs

## Phase 4: Audio and transcription (F04, F05)
- [ ] `AudioService` (ffprobe, normalize, chunk), `Transcriber` interface with faster-whisper, openai, and fake
- [ ] Offsets merged correctly; transcript stored with tsvector
- [ ] **Gate:** `pytest tests/test_audio.py tests/test_transcription.py` pass; real transcription of the spoken sample (`make_sample_audio.sh`) returns recognizable text

## Phase 5: LLM analysis (F06 to F09)
- [ ] `LLMClient` with anthropic and fake providers, prompts from `docs/PROMPTS.md`
- [ ] Single-pass and map-reduce, dedupe, retry-once validation, persist summary, action items, title
- [ ] **Gate:** `pytest tests/test_analysis.py` pass; real run on the spoken sample yields a summary and at least one action item

## Phase 6: Notes API completion (F10 to F18, F20)
- [ ] List with search, filter, sort, pagination; detail; transcript and search; audio-url
- [ ] Action item CRUD and cross-meeting list; rename; delete with storage cleanup; retry
- [ ] Markdown and PDF export (reportlab); `/readyz`
- [ ] **Gate:** all remaining backend tests in the TESTING.md matrix pass; `make test-backend` green with coverage at least 80 percent on services and workers

## Phase 7: Frontend foundation (U01 to U03)
- [ ] Design system and primitives, themes, app shell, command palette, shortcuts
- [ ] Landing, login, register, auth context, token refresh, protected routes
- [ ] **Gate:** `make test-frontend` green; manual check in light and dark at desktop and 390 px width

## Phase 8: Frontend features (U04 to U14)
- [ ] Upload and tracker, meetings list, dashboard, meeting detail with player and transcript, action items (list and board), my action items, settings, polish
- [ ] **Gate:** `make test-frontend`, `npm run lint`, `npm run typecheck`, `npm run build` all pass; walk the full flow manually

## Phase 9: End-to-end verification
- [ ] Playwright specs from `docs/TESTING.md`
- [ ] `scripts/smoke_test.py` and `make_sample_audio.sh`
- [ ] Crash recovery test executed and recorded
- [ ] **Gate:** `make test` green; `make smoke` all PASS with real Whisper and LLM; `docs/TEST_REPORT.md` has evidence for every F and U id; no BLOCKED rows unless explained

## Phase 10: Docs and clean-clone check
- [ ] Re-run every command in `README.md` from a fresh clone in a fresh shell; fix the README where reality differs
- [ ] `docs/DECISIONS.md` and `docs/UI_BACKLOG.md` up to date
- [ ] **Gate:** a fresh clone reaches a working app using only the README; final checklist mapping each acceptance criterion to evidence

## Stretch
- [ ] Speaker diarization, semantic search (pgvector), Slack or email share
