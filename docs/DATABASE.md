# Database Schema — MeetScribe

PostgreSQL 16 relational schema for MeetScribe.
API operates asynchronously via `asyncpg`; Celery workers and Alembic operate synchronously via `psycopg`.

## Overview
All primary keys use UUID v4. Timestamps are timezone-aware (`TIMESTAMPTZ`) in UTC. Foreign keys enforce cascade deletes to maintain clean user data isolation.

## Tables

### 1. `users`
Accounts and authentication.
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
```

### 2. `meetings`
Meeting audio uploads, metadata, and asynchronous processing lifecycle.
```sql
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled Meeting',
    title_edited BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending_upload',
    stage VARCHAR(32),
    progress_pct INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    process_attempts INTEGER NOT NULL DEFAULT 0,
    duration_sec DOUBLE PRECISION,
    language VARCHAR(16),
    audio_key VARCHAR(512),
    normalized_key VARCHAR(512),
    content_type VARCHAR(64),
    size_bytes BIGINT,
    filename VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_meetings_user_id ON meetings(user_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_created_at ON meetings(created_at DESC);
CREATE INDEX idx_meetings_user_created ON meetings(user_id, created_at DESC);
```

### 3. `transcripts`
Transcription text and timestamped segment details.
```sql
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
    full_text TEXT NOT NULL,
    language VARCHAR(16),
    segments JSONB NOT NULL DEFAULT '[]'::jsonb,
    tsv TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transcripts_meeting_id ON transcripts(meeting_id);
CREATE INDEX idx_transcripts_tsv ON transcripts USING gin(tsv);
```

### 4. `summaries`
LLM-generated executive summary, key points, and decisions.
```sql
CREATE TABLE summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
    decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_summaries_meeting_id ON summaries(meeting_id);
```

### 5. `action_items`
Structured action items extracted by LLM or added manually.
```sql
CREATE TABLE action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    owner VARCHAR(255),
    due_date DATE,
    priority VARCHAR(32) NOT NULL DEFAULT 'medium',
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    source_start_sec DOUBLE PRECISION,
    created_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_action_items_meeting_id ON action_items(meeting_id);
CREATE INDEX idx_action_items_user_id ON action_items(user_id);
CREATE INDEX idx_action_items_status ON action_items(status);
CREATE INDEX idx_action_items_due_date ON action_items(due_date);
CREATE INDEX idx_action_items_user_status ON action_items(user_id, status);
```

### 6. `jobs`
Execution attempts and reaper tracking for asynchronous pipeline jobs.
```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    celery_task_id VARCHAR(255),
    stage VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    attempt INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_meeting_id ON jobs(meeting_id);
CREATE INDEX idx_jobs_status_updated ON jobs(status, updated_at);
```

## Migration Strategy
- Managed with Alembic in `backend/alembic/`.
- Full-text search trigger updates `tsv` from `full_text` on insert or update.
- Migrations run synchronously using psycopg in `make migrate`.

