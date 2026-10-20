# DECISIONS — MeetScribe

Log of non-obvious assumptions and decisions, per AGENTS.md. Newest last.

## D1 — Docs live in docs/ (Phase 0)
AGENTS.md and PROMPT.md reference `docs/`, and the seven source-of-truth documents (PRD,
ARCHITECTURE, DATABASE, API, PROMPTS, TASKS, DEPLOYMENT) now live in `docs/` only — the
root copies no longer exist. `docs/` is the canonical location; checkboxes are ticked
there. AGENTS.md, PROMPT.md and README.md stay at the repo root.

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

## D13 — LocalStack replaces MinIO for local S3 (Phase 0)
The docs specify MinIO for local dev, but `minio/minio` and `minio/mc` can no longer be
pulled on this machine (Docker Hub returns 404 for the repo; `quay.io/minio/minio`
requires auth). Swapped for `localstack/localstack:3.8` with `SERVICES=s3`, which speaks
the same S3 API (presigned PUT/GET, head_object, delete) the app relies on. Consequences:
  - compose has one `localstack` service (replacing `minio` + `minio-init`); the bucket is
    created by `scripts/localstack-init.sh` via `awslocal`.
  - Local S3 endpoint becomes `http://localstack:4566` (internal) /
    `http://localhost:9000` (browser-facing, same as before).
  - Production is unaffected: `S3_ENDPOINT_URL=""` uses real AWS S3 (D11).
  - S3 access still goes through `StorageService` only, so tests use moto regardless.

## D14 — Auth libraries: passlib+bcrypt, PyJWT (Phase 1)
ARCHITECTURE.md says "argon2/bcrypt" hashing. Chose bcrypt via `passlib[bcrypt]` (the
most widely used, no native build issues) plus `PyJWT` for tokens (lighter than
python-jose, no cryptography pin conflicts). `bcrypt` is pinned `<4.1` because passlib
1.7.4 reads `bcrypt.__about__`, which 4.1 removed.

## D15 — Tests run against a real Postgres test database (Phase 1)
The schema uses Postgres-only features (native enums, `tsvector` generated columns,
`gen_random_uuid()`), so SQLite cannot stand in. Backend tests use a dedicated
`meetscribe_test` database (`TEST_DATABASE_URL`, default via local compose Postgres).
Each test gets a fresh engine bound to its own event loop with `NullPool`, and tables are
truncated before each test. The schema is created by `Base.metadata.create_all`; the
migration itself is verified separately with `alembic upgrade head`.

## D16 — JWT settings (Phase 1)
Access tokens 15 min, refresh tokens 7 days, HS256, per ARCHITECTURE.md. Claims:
`sub` (user id), `type` (`access`/`refresh`), `iat`, `exp`. A token's `type` is checked on
use, so a refresh token cannot be replayed as an access token (tested).

## D17 — API errors use a typed `APIError` + handlers (Phase 1)
docs/API.md requires `{"detail", "code"}`. Added `app/core/errors.py` (`APIError`) with a
FastAPI exception handler rendering that shape, plus a catch-all 500 handler returning
`INTERNAL_ERROR`. Pydantic validation errors still use FastAPI's default 422 shape.

## D18 — Frontend auth: token store, context, refresh-on-401 (Phase 1)
Tokens in `localStorage` (consistent with D3). `src/api/client.ts` attaches the access
token and, on the first 401, calls `/auth/refresh` once and retries; a failed refresh
clears tokens. `AuthContext`/`AuthProvider` split into two files so the provider file
exports only components (react-refresh rule).

## D19 — jsdom localStorage shim in tests (Phase 1)
jsdom 25 under Node 26 does not expose `localStorage`, which broke token-store tests. The
Vitest setup installs a minimal in-memory `Storage` shim only when the global is missing.
Browsers are unaffected.

## D20 — Upload validation rule (Phase 2)
`POST /meetings` accepts a file when its `content_type` is in the allowed set
(`audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/mp4`, `audio/m4a`, `audio/x-m4a`,
`audio/webm`, `audio/ogg`, `video/mp4`, `video/webm`), or when the type is generic
(`application/octet-stream`/empty) **and** the filename ends in an allowed extension. A
disallowed concrete type (e.g. `application/pdf`) is rejected with 415 regardless of the
filename. Oversize files are rejected with 413 using `MAX_UPLOAD_MB`. PRD F1 lists
formats; browsers sometimes omit a precise type, hence the extension fallback.

## D21 — Presign uses two boto3 clients (Phase 2)
`S3_ENDPOINT_URL` (internal, e.g. `http://localstack:4566`) is used for `head_object` and
`delete_object`; `S3_PUBLIC_ENDPOINT_URL` (`http://localhost:9000`) is used to build
presigned URLs the browser can resolve. When both are equal, one client is reused. This
keeps the Docker-internal hostname out of browser-facing URLs.

## D22 — A generic type with a wrong extension is rejected (Phase 2)
See D20: the octet-stream fallback requires a matching extension, so `notes.txt` as
`application/octet-stream` is a 415. Both paths are covered by tests.

## D23 — Ruff ignores B008 (Phase 2)
FastAPI's `Query(...)`/`Depends(...)` are called in argument defaults by design, so the
`B008` (function call in default) rule is disabled project-wide.

## D24 — LocalStack runs with S3_SKIP_SIGNATURE_VALIDATION=1 (Phase 2)
Presigned PUT URLs generated for the browser were rejected with `SignatureDoesNotMatch`
by LocalStack's default S3 signature validation (reproduced with a bare boto3 presign +
curl; ordinary signed boto3 requests worked). With `S3_SKIP_SIGNATURE_VALIDATION=1` the
presigned PUT returns 200 and the object is stored. The app's presign/head/delete code is
unchanged and correct — this is a LocalStack-specific dev accommodation. Production uses
real AWS S3, which validates signatures normally. Verified end to end: create → presigned
PUT → `head_object` → `queued`.
