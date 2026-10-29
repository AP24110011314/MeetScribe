# Product Requirements — MeetScribe

## Problem
People leave meetings without clear records of decisions and who owns what. Manual note-taking is slow and unreliable.

## Goal
Turn a raw recording into trustworthy, skimmable notes in minutes, with no manual effort.

## Users
Students and teams who record meetings, lectures, or standups. Primary persona: a team lead who wants action items assigned and tracked.

## Runtime
Runs directly on macOS (Apple silicon), no Docker. API port 8000, web app port 5173. Port 5000 is never used (reserved by macOS AirPlay Receiver).

## Out of scope (v1)
Real-time transcription, speaker diarization, calendar integration, team workspaces, billing.

## Stretch
Speaker diarization, Slack/email delivery, semantic search (pgvector), multi-language translation.

## Feature list (IDs are used by docs/TESTING.md)

### Backend and product features
| ID | Feature |
|----|---------|
| F01 | Register, login, refresh token, `me` (JWT, hashed passwords) |
| F02 | Audio upload via presigned URL (S3/MinIO) with type and size validation; `local` storage fallback for dev |
| F03 | Asynchronous processing with live status and progress |
| F04 | Audio normalization (16 kHz mono WAV) and chunking for long files (ffmpeg) |
| F05 | Whisper transcription with segment timestamps and language detection |
| F06 | Summary (max ~250 words), 3 to 10 key points, decisions |
| F07 | Action items: description, owner (nullable), due date (nullable), priority, source timestamp |
| F08 | Suggested meeting title |
| F09 | Long-transcript handling (map-reduce) |
| F10 | Meetings list with full-text search, status filter, pagination |
| F11 | Meeting detail (transcript, summary, action items) |
| F12 | Transcript retrieval and search |
| F13 | Audio playback via short-lived presigned GET (supports seeking) |
| F14 | Action item CRUD plus cross-meeting list with filters |
| F15 | Rename meeting |
| F16 | Delete meeting with storage cleanup |
| F17 | Retry failed meeting |
| F18 | Export notes to Markdown and PDF |
| F19 | Crash recovery: stuck jobs are re-queued by a reaper |
| F20 | Health and readiness endpoints |
| F21 | Per-user data isolation (ownership checks) |
| F22 | Rate limiting on auth endpoints |

### Interface features (details in docs/UI.md)
| ID | Feature |
|----|---------|
| U01 | Design system, light and dark theme |
| U02 | App shell, navigation, command palette, keyboard shortcuts |
| U03 | Landing page and polished auth pages |
| U04 | Dashboard with stats, chart, recent meetings |
| U05 | Upload experience: drag and drop, queue, progress, cancel |
| U06 | Processing step tracker with failed and retry states |
| U07 | Meetings list: grid and table, search, filters, sort, hover actions |
| U08 | Meeting detail tabs, copy and export buttons, inline title edit |
| U09 | Audio player with waveform, speed, skip |
| U10 | Transcript: click to seek, follow along, in-transcript search |
| U11 | Action items: list and kanban views, inline edit, overdue highlighting |
| U12 | "My action items" page |
| U13 | Settings (theme, density, default view) |
| U14 | Polish: toasts, undo, 404, accessibility, responsive layout |

## Non-functional requirements
- A 30-minute recording finishes in under 15 minutes on an M2 with the `small` model (target)
- Worker crash does not lose a meeting: the reaper re-queues it
- API p95 under 300 ms for non-processing endpoints
- In `s3` mode audio never passes through the API server
- Secrets only in `.env`

## Acceptance criteria
1. A user registers, uploads a 1 to 5 minute spoken sample, and sees transcript, summary, and at least one action item without manual steps
2. Every feature F01 to F22 and U01 to U14 passes its check in `docs/TESTING.md`
3. `kill -9` on the worker mid-job, then restarting it, ends with the meeting in `done` (within reaper window)
4. A second user cannot read, modify, or delete the first user's data (404)
5. `make test` passes; `make smoke` prints PASS for every step
6. README commands work from a clean clone on a Mac
