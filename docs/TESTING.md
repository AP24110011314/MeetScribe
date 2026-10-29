# Testing Plan — MeetScribe

Goal: prove every feature in `docs/PRD.md` works. The agent must run these tests, not just write them, and produce `docs/TEST_REPORT.md` with real results.

## Test layers
| Layer | Tool | Providers | Command |
|---|---|---|---|
| Backend unit and API | pytest + httpx + moto | `fake` Whisper, `fake` LLM, moto S3, test DB | `make test-backend` |
| Frontend unit | Vitest + RTL | mocked API | `make test-frontend` |
| Browser E2E | Playwright | real API on :8000 with `fake` providers, `local` or MinIO storage | `make e2e` |
| Live smoke | `scripts/smoke_test.py` | real Whisper, real LLM | `make smoke` |
| Crash recovery | manual script in this doc | real Whisper | see below |

Tests never download Whisper models or call a real LLM except the live smoke test.

## Test data
`scripts/make_sample_audio.sh` creates a spoken sample with macOS `say`:
```
Welcome to the weekly sync. We decided to ship the beta on November fifteenth.
Action item: Priya will update the API documentation by Friday.
Action item: Ravi should fix the login bug as soon as possible.
That is everything for today. Thanks everyone.
```
Command: `say -o .data/sample/meeting.aiff "<text>"` then `ffmpeg -y -i meeting.aiff meeting_sample.mp3`. Also generate a 35-minute file by looping the sample for chunking tests (`ffmpeg -stream_loop`), a 0-byte file, and a `.txt` renamed to `.mp3`.

## Feature matrix
Each row must have an automated test (A) and, where noted, an E2E or manual check (E).

| ID | Automated test (backend/tests/ unless noted) | E2E or manual check |
|---|---|---|
| F01 | `test_auth.py`: register, duplicate email 409, login ok, wrong password 401, refresh, `me`, expired token 401 | E: register then login in browser |
| F02 | `test_upload.py`: valid presign, bad type 422, oversize 422, complete missing file 400, complete ok, double complete 409; `test_storage_local.py` for local tokens (expired, tampered) | E: upload file, PUT reaches storage |
| F03 | `test_pipeline.py`: status transitions queued→…→done in eager mode; `/status` shape | E: tracker advances |
| F04 | `test_audio.py`: normalize yields 16 kHz mono; 35-min file yields 4 chunks | smoke on long file |
| F05 | `test_transcription.py`: fake transcriber merge with offsets; faster-whisper adapter mapped output shape (mocked model) | smoke: transcript has "API" |
| F06 | `test_analysis.py`: summary length, 3 to 10 key points, decisions | smoke |
| F07 | `test_analysis.py`: owner null when unstated, due date resolution, priority, source seconds; golden transcripts | smoke: at least 1 item, owner Priya or Ravi |
| F08 | `test_analysis.py`: title set unless `title_edited` | E |
| F09 | `test_analysis.py`: map-reduce path dedupes across windows; malformed JSON retried once then fails | none |
| F10 | `test_meetings_list.py`: pagination, status filter, `q` matches title and transcript, sorting | E: search box |
| F11 | `test_meeting_detail.py`: all sections present when done; pending meetings return partial | E |
| F12 | `test_transcript.py`: segments, `?q=` indexes | E: transcript search |
| F13 | `test_audio_url.py`: URL works with Range request, expires | E: player plays and seeks |
| F14 | `test_action_items.py`: create, patch, delete, filters (status, owner, priority, due_before) | E: edit and complete |
| F15 | `test_meetings_list.py`: patch title sets `title_edited` | E: inline rename |
| F16 | `test_delete.py`: rows and storage objects removed | E: delete with confirm |
| F17 | `test_retry.py`: failed → queued; non-failed 409 | E: retry button |
| F18 | `test_export.py`: markdown contains summary, decisions, action items; PDF starts with `%PDF` | E: download both |
| F19 | `test_reaper.py`: stale meeting re-queued, attempts incremented, fails after limit; fresh meeting untouched | manual crash test below |
| F20 | `test_health.py`: `/healthz` ok; `/readyz` 503 when a dependency is down (mocked) | `make check` |
| F21 | `test_isolation.py`: user B gets 404 on every meeting and action-item route of user A | none |
| F22 | `test_rate_limit.py`: 11th login attempt in a minute returns 429 | none |
| U01 | Vitest: theme toggle persists, respects system preference | E: toggle dark mode |
| U02 | Vitest: command palette filters and navigates; shortcuts dialog opens on `?` | E: Cmd+K flow |
| U03 | Vitest: auth form validation, password toggle | E: landing → register |
| U04 | Vitest: stat computation from list data; empty state | E: dashboard after upload |
| U05 | Vitest: file validation, queue state, cancel | E: upload with progress |
| U06 | Vitest: tracker maps each status to step; failed shows Retry | E: processing view |
| U07 | Vitest: grid/table toggle, filters, debounce | E |
| U08 | Vitest: tabs, copy-to-clipboard, inline title edit | E |
| U09 | Vitest: speed control, skip, fallback player when waveform fails | E |
| U10 | Vitest: active segment highlight, search next/prev | E |
| U11 | Vitest: complete toggle, overdue highlighting, kanban move | E |
| U12 | Vitest: grouping and filters | E |
| U13 | Vitest: settings persisted to localStorage | E |
| U14 | Vitest: toast + undo; axe checks on main pages; 404 page | E: mobile viewport check |

## Playwright E2E specs (`frontend/e2e/`)
Run against the real API with `TRANSCRIBER=fake`, `LLM_PROVIDER=fake`. Use `data-testid` names from `docs/UI.md`.
1. `auth.spec.ts`: register, logout, login, protected route redirect
2. `upload-flow.spec.ts`: upload sample, watch tracker reach Done, open meeting, see summary and action items
3. `action-items.spec.ts`: edit, complete, add, delete, board drag, global page filters
4. `meeting-management.spec.ts`: rename, search, export md and pdf (download event), retry a forced failure, delete
5. `ui-polish.spec.ts`: dark mode, command palette, 404, mobile viewport (390 px) no horizontal scroll
The fake providers must allow a forced failure (for example filename containing `fail`).

## Live smoke test: `scripts/smoke_test.py`
Runs against `http://localhost:8000` with the real providers. Steps, each printing `PASS` or `FAIL <reason>` and exiting 1 on any failure:
1. `GET /healthz` and `/readyz`
2. Register a random user and log in
3. Create sample audio if missing (`make_sample_audio.sh`)
4. `POST /meetings`, PUT the file to `upload_url`, `POST /complete`
5. Poll `/status` every 3 s (timeout 10 min) until `done`; fail on `failed`
6. Transcript is non-empty and mentions "documentation" or "login" (case-insensitive)
7. Summary is non-empty; key points between 1 and 10
8. At least 1 action item; at least one owner contains "Priya" or "Ravi"
9. Audio URL responds to a Range request with 206
10. Export markdown and PDF succeed
11. Patch an action item to done; list with `status=done` returns it
12. Isolation: second user gets 404 on the meeting
13. Delete the meeting; GET returns 404; storage object gone
Print a summary table at the end.

## Failure-path checks (automated where possible)
- Unsupported file, zero-byte file, oversize declaration
- Corrupt audio (text renamed to mp3) ends `failed` with a readable message and Retry works after fixing
- LLM returns invalid JSON twice → `failed` with readable message
- Storage object missing at `/complete`
- Worker down: meeting stays `queued`; starting the worker processes it

## Crash recovery test (F19, acceptance criterion 3)
**Run in:** project root, with `REAPER_STALE_MINUTES=1` in `.env` and the app running via `make dev`.
1. Upload the 35-minute file.
2. When status becomes `transcribing`, find the worker PID: `pgrep -f "celery.*worker"` and run `kill -9 <pid>`.
3. Restart the worker (Terminal: `cd backend && source .venv/bin/activate && celery -A app.workers.celery_app worker --pool=solo -l info`).
4. Within about 2 minutes the reaper re-queues the meeting; confirm the log line and `process_attempts` becomes 2.
5. Wait for `done`. Verify the transcript has no duplicated segments.
Record the result in `docs/TEST_REPORT.md`.

## Quality gates
- Backend coverage on `app/services` and `app/workers` at least 80 percent (`pytest --cov`)
- Frontend: all components with logic have tests; no `any`; axe reports no serious violations on dashboard, meeting detail, upload
- `make lint` clean
- No test depends on internet except the live smoke test

## `docs/TEST_REPORT.md` (generated by the agent)
Table with every feature ID: result (PASS/FAIL/BLOCKED), evidence (test name or command output), date. Plus: environment (macOS version, Python, Node, Whisper model), total test counts, coverage numbers, known gaps. A feature without evidence is marked BLOCKED, never PASS.
