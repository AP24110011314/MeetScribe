"""Database enums, matching docs/DATABASE.md exactly."""

import enum


class MeetingStatus(enum.StrEnum):
    PENDING_UPLOAD = "pending_upload"
    QUEUED = "queued"
    PREPARING = "preparing"
    TRANSCRIBING = "transcribing"
    ANALYZING = "analyzing"
    DONE = "done"
    FAILED = "failed"


class Priority(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ActionItemStatus(enum.StrEnum):
    OPEN = "open"
    DONE = "done"


class JobStatus(enum.StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class JobStage(enum.StrEnum):
    PREPARE = "prepare"
    TRANSCRIBE = "transcribe"
    ANALYZE = "analyze"
    FINALIZE = "finalize"
