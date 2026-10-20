# Product Requirements — MeetScribe

## Problem
People leave meetings without clear records of decisions and who owns what. Manual note-taking is slow and unreliable.

## Goal
Turn a raw recording into a trustworthy, skimmable set of notes in minutes, with no manual effort.

## Users
- Students and teams who record meetings, lectures, or standups
- Primary persona: a team lead who wants action items assigned and tracked

## Scope (MVP)
1. Sign up / log in
2. Upload an audio or video file
3. See processing status in real time
4. View transcript (with timestamps), summary, decisions, action items
5. Edit, complete, or delete action items
6. Search and list past meetings
7. Export notes as Markdown or PDF
8. Delete a meeting (removes DB rows and S3 objects)

## Out of scope (v1)
Live/real-time transcription, speaker diarization, calendar integration, team workspaces, billing.

## Stretch goals
- Speaker diarization (pyannote)
- Slack/Email delivery of notes
- Semantic search across meetings (pgvector)
- Calendar import and auto-titling
- Multi-language transcripts with translation

## Functional requirements
| ID | Requirement |
|----|-------------|
| F1 | Files up to 500 MB, formats: mp3, wav, m4a, mp4, webm, ogg |
| F2 | Upload goes directly to S3 via presigned URL; API only stores metadata |
| F3 | Processing is asynchronous; the UI shows status without page reload |
| F4 | Transcript includes segments with start/end seconds |
| F5 | Summary max ~250 words; 3 to 10 key points; decisions list |
| F6 | Each action item has: description, owner (nullable), due date (nullable), priority (low/med/high), source timestamp |
| F7 | Failed jobs show a human-readable error and can be retried |
| F8 | Users can only see their own meetings |

## Non-functional requirements
- A 30-minute meeting completes in under 10 minutes on CPU with `small` model (target, not hard guarantee)
- Worker crashes must not lose jobs (acks_late, retries)
- API p95 under 300 ms for non-processing endpoints
- No audio ever passes through the API server
- Secrets only in env vars

## Acceptance criteria (MVP)
- A user can register, upload a 5-minute sample, and within a few minutes see transcript, summary, and at least one action item
- Killing the worker mid-job and restarting it resumes or retries the job to completion
- A second user cannot access the first user's meeting (403/404)
- All tests pass in CI

## Success metrics (portfolio)
Live demo link, README with architecture diagram, test coverage over 70% on backend services, CI badge green.
