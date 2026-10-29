# Test Report — MeetScribe

## Environment
- **OS**: macOS (Apple silicon M2)
- **Python**: 3.11.11
- **Node**: 20.18.0
- **Database**: PostgreSQL 16
- **Cache/Broker**: Redis 7
- **Storage**: MinIO / S3 compatible
- **Transcriber**: faster-whisper (CPU, int8) / fake provider
- **LLM**: Anthropic Claude / fake provider

## Feature Matrix

| ID | Feature Description | Result | Evidence / Test | Date |
|---|---|---|---|---|
| F01 | Register, login, refresh token, me (JWT, argon2) | PASS | test_auth.py, manual curl on port 8000 | 2026-10-29 |
| F02 | Audio upload via presigned URL (S3/local) | PASS | test_upload.py, test_storage_local.py, manual curl PUT to MinIO & local dev-storage | 2026-10-29 |
| F03 | Asynchronous processing with live status | PASS | test_pipeline.py, GET /meetings/{id}/status, live make dev queued->done | 2026-10-29 |
| F04 | Audio normalization (16 kHz mono) and chunking | PASS | test_audio.py: probe, 16kHz mono normalization, 35-min file yields 4 chunks | 2026-10-29 |
| F05 | Whisper transcription with timestamps | PASS | test_transcription.py, tsvector trigger, real faster-whisper run on meeting_sample.wav | 2026-10-29 |
| F06 | Summary, key points, decisions | PASS | test_analysis.py, real run on spoken sample yielded summary, key points, decisions | 2026-10-29 |
| F07 | Action items extraction (owner, due date, priority) | PASS | test_analysis.py (null owner when unstated, date parsing, priority), spoken sample items | 2026-10-29 |
| F08 | Suggested meeting title | PASS | test_analysis.py: title set only when title_edited=False | 2026-10-29 |
| F09 | Long-transcript map-reduce & retry validation | PASS | test_analysis.py: map-reduce on 40-min transcript, AnthropicClient retry-once validation | 2026-10-29 |
| F10 | Meetings list with search, filter, pagination | PENDING | Phase 6 | |
| F11 | Meeting detail (transcript, summary, action items) | PENDING | Phase 6 | |
| F12 | Transcript retrieval and segment search | PENDING | Phase 6 | |
| F13 | Audio playback via presigned GET (Range support) | PENDING | Phase 6 | |
| F14 | Action item CRUD & cross-meeting list | PENDING | Phase 6 | |
| F15 | Rename meeting (title_edited flag) | PENDING | Phase 6 | |
| F16 | Delete meeting with storage cleanup | PENDING | Phase 6 | |
| F17 | Retry failed meeting | PENDING | Phase 6 | |
| F18 | Export notes to Markdown and PDF | PENDING | Phase 6 | |
| F19 | Crash recovery: stuck jobs re-queued by reaper | PASS | test_reaper.py, reaper re-queuing and max attempts failure verification | 2026-10-29 |
| F20 | Health (/healthz) and readiness (/readyz) | PASS | test_healthz_endpoint, /healthz curl | 2026-10-29 |
| F21 | Per-user data isolation (ownership checks 404) | PASS | test_isolation.py | 2026-10-29 |
| F22 | Rate limiting on auth endpoints (slowapi) | PASS | test_rate_limit.py | 2026-10-29 |
| U01 | Design system, light/dark theme | PENDING | Phase 7 | |
| U02 | App shell, navigation, command palette, shortcuts | PENDING | Phase 7 | |
| U03 | Landing page and polished auth pages | PENDING | Phase 7 | |
| U04 | Dashboard with stats, chart, recent meetings | PENDING | Phase 8 | |
| U05 | Upload experience: drag & drop, queue, progress | PENDING | Phase 8 | |
| U06 | Processing step tracker with failed/retry states | PENDING | Phase 8 | |
| U07 | Meetings list: grid/table, search, filters, sort | PENDING | Phase 8 | |
| U08 | Meeting detail tabs, copy, export, inline title | PENDING | Phase 8 | |
| U09 | Audio player with waveform, speed, skip | PENDING | Phase 8 | |
| U10 | Transcript click-to-seek, follow-along, search | PENDING | Phase 8 | |
| U11 | Action items list & kanban views, inline edit | PENDING | Phase 8 | |
| U12 | My action items page | PENDING | Phase 8 | |
| U13 | Settings (theme, density, default view) | PENDING | Phase 8 | |
| U14 | Polish: toasts, undo, 404, accessibility | PENDING | Phase 8 | |

## Summary Stats
- Total Features: 36 (22 Backend/Product, 14 UI)
- Passed: 13 (F01, F02, F03, F04, F05, F06, F07, F08, F09, F19, F20, F21, F22)
- Pending: 23
- Failed: 0

