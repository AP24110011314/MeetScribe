# DECISIONS — MeetScribe

Log of non-obvious assumptions and decisions, per AGENTS.md. Newest last.

## D1 — Docs live at repo root and in docs/ (Phase 0)
AGENTS.md and PROMPT.md reference `docs/`, but the source documents were authored at the
repo root. Per user instruction, `docs/` holds copies of the seven source-of-truth
documents (PRD, ARCHITECTURE, DATABASE, API, PROMPTS, TASKS, DEPLOYMENT). The `docs/`
copies are the canonical working copies (checkboxes are ticked there); if a doc change is
made in a later phase, both copies are kept identical.

## D2 — Project files live at repo root
AGENTS.md's layout drawing shows a `meetscribe/` directory, but the repository root
already is the project. `backend/`, `frontend/`, `docker-compose.yml` etc. sit at the
repo root. No nested wrapper directory.

## D3 — Refresh tokens travel in the request body (Phase 1, from API.md)
`POST /auth/refresh` takes `{refresh_token}` in the JSON body (per API.md), not an
httpOnly cookie. Simpler and works with the React SPA + fetch; tradeoff: tokens are
JS-accessible. Revisit with cookies if this ships beyond a portfolio piece.

## D4 — Rate limiting will use slowapi (Phase 8)
ARCHITECTURE.md requires auth rate limiting but names no library. `slowapi` is the
simplest FastAPI-native option (slowapi: Flask-Limit style limiter for Starlette).
Will be applied to `/auth/login` and `/auth/register` only.

## D5 — Analysis constants (Phase 5)
"About 20k tokens" → `ANALYSIS_TOKEN_BUDGET = 20000`. "About 10 min" map windows →
`MAP_WINDOW_SEC = 600`. Token estimation: chars / 4 (no tokenizer dependency).

## D6 — OpenAI Whisper provider implemented but not default (Phase 4)
ARCHITECTURE.md calls `OpenAIWhisperTranscriber` optional. It will be implemented behind
the same `Transcriber` interface (env `TRANSCRIBER=openai`) but the default remains
`faster_whisper`. No model downloads in unit tests either way.

## D7 — Unit tests never touch models or real services (all phases)
`faster_whisper` is imported lazily inside the transcriber implementation so collecting
tests never triggers a model download. LLM, S3, and transcriber are mocked/faked in
tests (moto for S3 in Phase 2, FakeTranscriber, FakeLLMClient).

## D8 — CI stays CPU-light (all phases)
CI runs backend lint/type/tests and frontend lint/type/tests/build. No Whisper model
downloads, no docker-compose in CI for now. Full end-to-end verification happens locally
via `docker compose up --build`.

## D9 — compose includes a `beat` service from Phase 0 (ARCHITECTURE.md local infra)
ARCHITECTURE.md lists `beat` in the compose services; TASKS.md Phase 0 omits it. It is
included from the start (same image as api/worker, no tasks until Phase 3) so the
reliability sweep task has a home when Phase 3 lands.

## D10 — Frontend talks to the API via relative `/api` paths + Vite dev proxy (Phase 0)
The SPA calls `/api/v1/...` relative paths. In dev the Vite server proxies `/api` to the
backend (`VITE_PROXY_TARGET`, default `http://localhost:8000`, `http://api:8000` inside
compose). This avoids hardcoded hosts and CORS complexity in dev; production serves the
built SPA behind the same origin (Phase 9).

## D11 — S3 endpoint config treats empty string as "use AWS default" (Phase 2)
DEPLOYMENT.md says production sets `S3_ENDPOINT_URL` empty. Config models it as `str`
defaulting to the MinIO URL; the StorageService converts `""` to `None` for boto3 so
AWS default endpoints are used. (Recorded now because it shaped `.env.example`.)

## D12 — Progress percentage derivation (Phase 3)
API.md maps statuses to progress (`queued 5%`, `preparing 15%`, `transcribing 15-70%`,
`analyzing 70-95%`, `done 100%`). `jobs` schema has no progress column, so
`progress_pct` is derived from the latest job's `stage` plus the meeting status; the
chunk-based refinement within `transcribing` uses the segment/chunk counts recorded on
the job row's `error`-adjacent metadata only if needed later — no schema change.
