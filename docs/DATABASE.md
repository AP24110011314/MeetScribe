# Database Schema — MeetScribe (PostgreSQL 16)

All ids are UUIDs (`gen_random_uuid()`), timestamps are `timestamptz` default `now()`.

## users
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| email | text unique not null | lowercase |
| password_hash | text not null | |
| created_at | timestamptz | |

## meetings
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users, index | |
| title | text | defaults to filename, replaced by suggested title |
| original_filename | text | |
| content_type | text | |
| size_bytes | bigint | |
| audio_key | text | S3 key of original |
| normalized_key | text null | S3 key of 16kHz wav |
| duration_sec | real null | |
| language | text null | detected |
| status | enum | pending_upload, queued, preparing, transcribing, analyzing, done, failed |
| error_message | text null | user-readable |
| created_at, updated_at | timestamptz | |

Indexes: `(user_id, created_at desc)`, `(status)`.

## transcripts
| column | type | notes |
|---|---|---|
| meeting_id | uuid PK FK meetings on delete cascade | one per meeting |
| full_text | text | |
| segments | jsonb | `[{start, end, text}]` |
| model | text | e.g. faster-whisper-small |
| search_vector | tsvector | generated from full_text, GIN index |

## summaries
| column | type | notes |
|---|---|---|
| meeting_id | uuid PK FK cascade | |
| summary | text | |
| key_points | jsonb | list of strings |
| decisions | jsonb | list of strings |
| llm_model | text | |
| created_at | timestamptz | |

## action_items
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| meeting_id | uuid FK cascade, index | |
| description | text not null | |
| owner | text null | as spoken, not a user FK |
| due_date | date null | |
| priority | enum low/medium/high default medium | |
| status | enum open/done default open | |
| source_start_sec | real null | links back to transcript |
| created_by_ai | bool default true | |
| created_at, updated_at | timestamptz | |

## jobs
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| meeting_id | uuid FK cascade, index | |
| celery_task_id | text null | |
| stage | text | prepare, transcribe, analyze, finalize |
| status | enum queued/running/succeeded/failed | |
| attempts | int default 0 | |
| error | text null | internal detail |
| started_at, finished_at | timestamptz null | |

## Notes
- Deleting a meeting cascades to all child rows; the service also deletes S3 objects (best effort, logged on failure).
- Use Alembic for every change. Never edit applied migrations.
- Seed script `scripts/seed.py` creates a demo user and sample meeting for UI development.
