# REST API — MeetScribe

Base URL: `http://localhost:8000/api/v1` · Swagger: `http://localhost:8000/docs`

All routes except `/auth/register`, `/auth/login`, `/auth/refresh`, health, and dev-storage need `Authorization: Bearer <access_token>`. Errors: `{ "detail": "message", "code": "ERROR_CODE" }`. Other users' resources return `404`.

## Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | /auth/register | `{email, password}` (password ≥ 8) | `201 {id, email}`; `409` if email exists |
| POST | /auth/login | `{email, password}` | `{access_token, refresh_token, token_type}`; `401` on bad credentials |
| POST | /auth/refresh | `{refresh_token}` | `{access_token}` |
| GET | /auth/me | none | `{id, email}` |

## Meetings
| Method | Path | Description |
|---|---|---|
| POST | /meetings | Body `{filename, content_type, size_bytes}`. `422` for unsupported type or size over `MAX_UPLOAD_MB`. Returns `{meeting_id, upload_url, upload_method:"PUT", upload_headers, expires_in, storage_backend}` |
| POST | /meetings/{id}/complete | Verifies object exists, enqueues processing. `409` if already queued or done; `400` if file missing |
| GET | /meetings | Query `q`, `status`, `sort` (`created_at|title|duration`), `order`, `page`, `page_size`. Returns `{items, total, page, page_size}`; `q` searches title and transcript |
| GET | /meetings/{id} | Detail: meeting fields plus `summary`, `action_items`, `has_transcript` |
| GET | /meetings/{id}/status | `{status, stage, progress_pct, error_message, process_attempts}` (frontend polls every 2.5 s) |
| GET | /meetings/{id}/transcript | `{language, full_text, segments[]}`; `?q=term` returns matching segment indexes |
| GET | /meetings/{id}/audio-url | `{url, expires_in}` presigned GET (Range supported) |
| PATCH | /meetings/{id} | `{title}`; sets `title_edited=true` |
| POST | /meetings/{id}/retry | Only for `failed`; resets attempts and re-enqueues |
| DELETE | /meetings/{id} | `204`; removes rows and stored files |
| GET | /meetings/{id}/export?format=md\|pdf | File download; `409` if not `done` |

## Action items
| Method | Path | Description |
|---|---|---|
| GET | /action-items | Query `status`, `meeting_id`, `owner`, `priority`, `due_before`, `page`, `page_size`; each item includes `meeting_title` |
| POST | /meetings/{id}/action-items | Create manual item |
| PATCH | /action-items/{id} | Any of `description, owner, due_date, priority, status` |
| DELETE | /action-items/{id} | `204` |

## System (no auth)
- `GET /healthz` → `{status:"ok"}`
- `GET /readyz` → `{db, redis, storage}` each `ok|fail`; `503` if any fail

## Dev storage (only when `STORAGE_BACKEND=local`)
- `PUT /dev-storage/upload/{token}` (raw body) → `200`
- `GET /dev-storage/download/{token}` → file with Range support
Tokens are signed, expire in 15 min, and are bound to one key.

## Example: meeting detail
```json
{
  "id": "…", "title": "Sprint planning", "status": "done",
  "duration_sec": 1832.4, "language": "en", "has_transcript": true,
  "summary": { "summary": "…", "key_points": ["…"], "decisions": ["…"] },
  "action_items": [
    { "id": "…", "description": "Update the API documentation", "owner": "Priya",
      "due_date": "2026-11-06", "priority": "high", "status": "open",
      "source_start_sec": 41.5, "created_by_ai": true }
  ]
}
```
