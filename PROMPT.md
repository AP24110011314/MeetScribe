# OpenCode Prompts — MeetScribe

## How to use
1. Create an empty folder `meetscribe/`, run `git init`.
2. Copy `AGENTS.md`, `README.md`, `PROMPT.md` to the root and the `docs/` folder as given.
3. Start OpenCode in the folder (`opencode`). Use Plan mode first, then Build mode.
4. Paste the **Master Kickoff Prompt**, then feed the **Phase Prompts** one at a time.
5. After each phase: run tests, review the diff, commit.

---

## Master Kickoff Prompt (paste first)

```
You are a senior full-stack engineer. We are building MeetScribe, a meeting notes
summarizer: users upload meeting audio, it is transcribed with Whisper, and an LLM
produces a summary, decisions, and action items. Processing is asynchronous.

First, read AGENTS.md and everything in docs/ (PRD.md, ARCHITECTURE.md, DATABASE.md,
API.md, PROMPTS.md, TASKS.md, DEPLOYMENT.md). Treat them as the source of truth.

Do not write code yet. Respond with:
1. A short summary of the system in your own words (max 10 lines)
2. Any ambiguities or risks you see in the docs
3. The exact files you will create in Phase 0 of docs/TASKS.md
4. Assumptions you will make

Wait for my approval before implementing. When implementing, follow the working
agreement in AGENTS.md: one phase at a time, tests and lint must pass, tick the
checkboxes in docs/TASKS.md, and report what you ran and the results.
```

---

## Phase Prompts

### Phase 0
```
Implement Phase 0 from docs/TASKS.md. Create the monorepo scaffold, docker-compose
(postgres, redis, minio, minio-init that creates the bucket, api, worker, frontend),
FastAPI app with /healthz, Alembic setup, Vite React TS + Tailwind app, and GitHub
Actions CI. Verify `docker compose up --build` starts all services and /healthz returns
200. Run lint and tests. Tick completed items in docs/TASKS.md.
```

### Phase 1
```
Implement Phase 1: SQLAlchemy models and migration exactly per docs/DATABASE.md, then
auth endpoints per docs/API.md (register, login, refresh, me) with argon2 or bcrypt
hashing and JWT. Add a get_current_user dependency. Write pytest tests for the full auth
flow and invalid cases. Then build the frontend login/register pages, auth context,
protected routes, and an API client that refreshes tokens on 401.
```

### Phase 2
```
Implement Phase 2: StorageService using boto3 with presigned PUT and GET, head_object,
and delete, working with MinIO locally (use S3_PUBLIC_ENDPOINT_URL for presigned URLs
that the browser can reach). Add POST /meetings and POST /meetings/{id}/complete with
validation of content type, size limit, and ownership. Build the frontend drag-and-drop
uploader that PUTs directly to the presigned URL with a progress bar, then calls
/complete. Add a meetings list page. Write tests with moto or a MinIO fixture.
```

### Phase 3
```
Implement Phase 3: Celery app and a process_meeting chain with four stub stages
(prepare_audio, transcribe, analyze, finalize). Each stage must update meetings.status
and the jobs row, use acks_late and task_reject_on_worker_lost, and retry transient
errors with exponential backoff up to 3 times. Add GET /meetings/{id}/status and a
frontend progress bar that polls every 2.5 seconds and stops when done or failed. Add a
celery beat task that fails meetings stuck in a processing state for over 60 minutes.
Test state transitions with Celery eager mode.
```

### Phase 4
```
Implement Phase 4: AudioService (ffprobe duration, ffmpeg normalize to 16 kHz mono wav,
chunk files longer than 30 minutes) and the Transcriber interface with
FasterWhisperTranscriber (load model once per worker process, config from env). Replace
the transcribe and prepare_audio stubs. Merge chunk segments with correct time offsets,
store transcript, segments, language, duration, and the tsvector. Clean temp files in
finally blocks. Tests: use a short fixture audio file and a FakeTranscriber; do not
download Whisper models in unit tests.
```

### Phase 5
```
Implement Phase 5: LLMClient interface with an Anthropic implementation that returns
JSON validated by the Pydantic MeetingAnalysis model. Put prompts from docs/PROMPTS.md
in app/services/prompts.py. Implement the single-pass path and the map-reduce path for
long transcripts, dedupe action items, retry once on validation failure, and persist
summary, decisions, key points, action items, and suggested_title. Never invent owners
or dates. Tests use a FakeLLMClient and golden transcripts, including malformed JSON.
```

### Phase 6
```
Implement Phase 6: the meeting detail page with summary, key points, decisions, an
editable action items table, a transcript with clickable timestamps that seek an audio
player (use /meetings/{id}/audio-url), list search and status badges and pagination,
and a global "My action items" page. Use optimistic updates with TanStack Query. Add
loading, empty, and error states everywhere. Add Vitest tests for key components.
```

### Phase 7
```
Implement Phase 7: Markdown and PDF export endpoints, retry for failed meetings,
delete with S3 cleanup, and user-friendly error messages mapped from internal job
errors. Add tests for each endpoint and the frontend buttons.
```

### Phase 8
```
Implement Phase 8 hardening: rate limiting on auth routes, strict CORS, /readyz checking
DB, Redis, and S3, structured JSON logging with meeting_id and job_id, and a Flower
service under a dev profile. Raise backend service coverage to at least 70 percent. Do an
accessibility and responsive pass on the frontend and add dark mode.
```

### Phase 9
```
Follow docs/DEPLOYMENT.md to create docker-compose.prod.yml, a production Dockerfile for
each service, and a deploy workflow. Add an architecture diagram (Mermaid in README),
a screenshots section, and a "How it works" section. Ensure README quick start works
from a clean clone.
```

---

## Utility Prompts

**Review before commit**
```
Review the current git diff against AGENTS.md rules. List violations, missing tests,
security issues (ownership checks, secrets, presign scope), and edge cases. Fix them.
```

**Debug a failing pipeline**
```
A meeting is stuck in status "{status}". Inspect worker logs, the jobs table, and the
relevant service. Find the root cause, propose a minimal fix, add a regression test,
then apply it.
```

**Add a feature safely**
```
Before coding, update the relevant docs (PRD, API, DATABASE) with the change and list
affected files. Then implement, test, and update docs/TASKS.md.
```

**Refactor checkpoint**
```
Check for duplicated logic between routers and services, unused code, and missing type
hints. Refactor without changing behavior and prove it with the existing test suite.
```
