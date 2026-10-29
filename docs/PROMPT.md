# OpenCode Prompts — MeetScribe (macOS, no Docker, API on port 8000, never port 5000)

## How to use
1. Make an empty folder `meetscribe/` and run `git init`.
2. Copy `AGENTS.md`, `README.md`, `PROMPT.md` to the root and the whole `docs/` folder.
3. Have your Anthropic API key ready. The API uses port 8000; port 5000 is never used.
4. Run `opencode` in the folder. Use Plan mode for the first reply, then Build mode.
5. Paste the **Master Prompt**. Reply `continue` after each phase report. If a phase fails its gate, the agent must fix it before moving on.

---

## Master Prompt (paste this first)

```
You are a senior full-stack engineer. Implement the complete MeetScribe project in this
repository: users upload meeting audio, it is transcribed with Whisper, and an LLM
produces a summary, decisions, and action items. Processing is asynchronous.

ENVIRONMENT (important)
- macOS on Apple silicon (MacBook M2). Run everything directly on the machine.
- NO Docker. Do not create Dockerfiles, compose files, or Docker instructions.
- The API server MUST listen on port 8000 (frontend on 5173). NEVER use port 5000 anywhere
  (code, config, scripts, tests, docs): macOS reserves it for AirPlay Receiver. Make Settings
  reject API_PORT=5000 and make scripts/check_env.py fail on it.
- Services come from Homebrew: PostgreSQL 16, Redis, ffmpeg, MinIO. Python 3.11 venv in
  backend/.venv. Celery worker uses --pool=solo.

SOURCE OF TRUTH
Read fully, in this order, before writing code: AGENTS.md, docs/PRD.md,
docs/ARCHITECTURE.md, docs/DATABASE.md, docs/API.md, docs/PROMPTS.md, docs/UI.md,
docs/SETUP_MAC.md, docs/TESTING.md, docs/TASKS.md, README.md.
If documents conflict, AGENTS.md wins, then ARCHITECTURE.md. Do not change the stack,
schema, or API contracts without asking me.

GOAL
Every feature F01 to F22 and U01 to U14 in docs/PRD.md must be implemented AND proven to
work by running tests, as laid out in docs/TESTING.md. "Implemented" without a passing
test or a recorded manual run does not count.

HOW TO WORK
1. Execute docs/TASKS.md from Phase 0 to Phase 10, one phase at a time.
2. At the start of each phase give a short plan (files, assumptions). Record non-obvious
   assumptions in docs/DECISIONS.md.
3. Implement the whole phase including its tests. No stubs or TODOs except the Phase 3
   stub stages that Phases 4 and 5 replace.
4. Run EVERY gate command listed for the phase. Do not move on while anything fails. Never
   claim something works without running it; show real command output in your report.
5. Tick the boxes in docs/TASKS.md, update docs/TEST_REPORT.md (feature id, result,
   evidence), and commit with a conventional message.
6. After each phase STOP and report: what you built, gate commands with results, new
   dependencies with a one-line reason, assumptions, and the next phase. Wait for my
   "continue".

NON-NEGOTIABLE RULES
- API on port 8000, never port 5000; no Docker.
- Audio never passes through the API in s3 mode; STORAGE_BACKEND=local is the dev-only
  exception.
- S3, Whisper, and LLM are accessed only through interfaces so tests can fake them.
  Unit tests never download Whisper models or call real LLMs.
- Celery tasks are idempotent, acks_late, retry only transient errors, and the reaper
  re-queues stuck jobs.
- LLM output is JSON validated by Pydantic with one retry. Never invent owners or dates;
  use null.
- Every meeting and action-item route enforces ownership (404 for others).
- Frontend uses only endpoints documented in docs/API.md. Needs-backend ideas go in
  docs/UI_BACKLOG.md.
- No secrets in code or commits. Strict typing in Python and TypeScript.

IF YOU GET STUCK
If a command fails twice for the same reason or a requirement is ambiguous, stop and ask me
with the exact error and two options. Do not skip tests or silently work around problems.

FINAL DELIVERY (after Phase 10)
- A fresh clone reaches a working app using only README.md.
- make test passes; make smoke prints PASS for every step using real Whisper and the real
  LLM; the crash recovery test is executed and recorded.
- docs/TEST_REPORT.md lists every F and U id with PASS and evidence.
- Give me a checklist mapping each PRD acceptance criterion to its evidence, and list
  anything you could not verify.

Begin now: read all documents, then reply with (1) a 10-line summary of the system,
(2) ambiguities or risks, (3) the exact file list for Phase 0. Wait for my "continue".
```

---

## Prompt to skip pauses (optional)
Append this to the master prompt if you want it to run all phases without waiting:
```
Do not wait for "continue" between phases. Continue automatically only when the phase gate
fully passes; stop and ask me if any gate fails twice. Keep reporting briefly after each phase.
```

## Resume prompt (new session or lost context)
```
Read AGENTS.md and docs/TASKS.md. Find the first unchecked item, check git log and
docs/TEST_REPORT.md to confirm the real state, run `make check` and `make test` to see what
currently passes, then resume from that item following the same rules (macOS, no Docker, API
on port 8000, never 5000, run every gate, report after each phase).
```

## Final verification prompt (run after Phase 10 or any time)
```
Audit the project against docs/PRD.md and docs/TESTING.md. Do not trust earlier reports.
1. Run: make check, make lint, make test, then start make dev in the background and run make smoke.
2. For each feature id F01 to F22 and U01 to U14, find the test or run the manual check that
   proves it, and mark PASS, FAIL, or BLOCKED in docs/TEST_REPORT.md with evidence.
3. Run the crash recovery test from docs/TESTING.md with REAPER_STALE_MINUTES=1.
4. Confirm the API runs on port 8000 (lsof -nP -iTCP:8000 -sTCP:LISTEN), that `grep -rnw "5000" backend frontend scripts Makefile Procfile.dev Procfile.local .env.example` prints nothing, and that no Docker
   files exist in the repo.
5. Fix every FAIL (code, tests, or docs), re-run, and repeat until none remain.
Report the final table and anything still BLOCKED with the reason.
```

## README check prompt
```
Verify README.md exactly as a new user would. In a fresh shell, follow every command in the
order written, from the directory stated before it. Fix the README wherever a command fails,
a directory is wrong, or output differs. Report each step as PASS or FIXED with the change.
```

## Utility prompts
**Review before commit**
```
Review the git diff against AGENTS.md. List rule violations, missing tests, security issues
(ownership checks, presign scope, secrets), and edge cases. Fix them and re-run make test.
```
**Debug a stuck meeting**
```
Meeting {id} is stuck in status "{status}". Check the worker terminal output, the jobs table, the
meetings row (status, progress_pct, process_attempts, updated_at), and the reaper logs. Find
the root cause, add a regression test, then fix it.
```
**Add a feature safely**
```
Update docs/PRD.md, docs/API.md, docs/DATABASE.md, docs/TESTING.md first and list the affected
files. Then implement, test, run make test, and update docs/TASKS.md.
```
