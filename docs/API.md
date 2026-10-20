# REST API — MeetScribe (`/api/v1`)

All endpoints except auth return `401` without a valid `Authorization: Bearer <token>`. Errors use `{ "detail": "message", "code": "ERROR_CODE" }`.

## Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | /auth/register | `{email, password}` | `201 {id, email}` |
| POST | /auth/login | `{email, password}` | `{access_token, refresh_token, token_type}` |
| POST | /auth/refresh | `{refresh_token}` | `{access_token}` |
| GET | /auth/me | none | `{id, email}` |

## Meetings
| Method | Path | Description |
|---|---|---|
| POST | /meetings | Body `{filename, content_type, size_bytes}`. Validates type and size, creates meeting, returns `{meeting_id, upload_url, upload_headers, expires_in}` |
| POST | /meetings/{id}/complete | Verifies S3 object, enqueues processing. Returns meeting with `status=queued`. `409` if already queued |
| GET | /meetings | Query: `q` (full-text search), `status`, `page`, `page_size`. Returns paginated list |
| GET | /meetings/{id} | Meeting detail including transcript, summary, action items when done |
| GET | /meetings/{id}/status | `{status, stage, progress_pct, error_message}`. Frontend polls every 2-3 s (SSE endpoint `/meetings/{id}/events` optional) |
| GET | /meetings/{id}/audio-url | Short-lived presigned GET for playback |
| GET | /meetings/{id}/transcript | Segments array |
| POST | /meetings/{id}/retry | Re-enqueue a failed meeting |
| PATCH | /meetings/{id} | Update `title` |
| DELETE | /meetings/{id} | Deletes DB rows and S3 objects. `204` |
| GET | /meetings/{id}/export?format=md\|pdf | Download notes |

## Action items
| Method | Path | Description |
|---|---|---|
| GET | /action-items | Query: `status`, `meeting_id`, `owner`. Cross-meeting list for the current user |
| PATCH | /action-items/{id} | Update `description, owner, due_date, priority, status` |
| POST | /meetings/{id}/action-items | Create manual item |
| DELETE | /action-items/{id} | `204` |

## System
- `GET /healthz`, `GET /readyz` (no auth)

## Status mapping for progress bar
`queued 5%`, `preparing 15%`, `transcribing 15-70%` (by chunk), `analyzing 70-95%`, `done 100%`.

## Example: meeting detail response
```json
{
  "id": "…",
  "title": "Sprint planning",
  "status": "done",
  "duration_sec": 1832.4,
  "language": "en",
  "summary": { "summary": "…", "key_points": ["…"], "decisions": ["…"] },
  "action_items": [
    { "id": "…", "description": "Update the API docs", "owner": "Ravi",
      "due_date": "2026-11-02", "priority": "high", "status": "open",
      "source_start_sec": 412.5 }
  ]
}
```
