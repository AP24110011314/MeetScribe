"""Processing pipeline stages (ARCHITECTURE.md).

Phase 3 built the skeleton; Phase 4 filled in `prepare` (download → normalize → upload) and
`transcribe` (chunk → Whisper → merged transcript). Phase 5 fills in `analyze` (LLM summary
+ decisions + action items).

The pipeline core is async (`run_pipeline`), so tests can await it inside an existing event
loop. Celery task bodies are synchronous, so they wrap the core with `run_sync`, which owns
the event loop for that call.

Stage work is idempotent: `prepare` skips if the normalized object already exists, and
`transcribe` skips if a transcript row is already present (D34). `analyze` replaces the
meeting's summary and AI action items on re-run (D41).
"""

import asyncio
import contextlib
import logging
import shutil
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.db.enums import JobStage, MeetingStatus
from app.db.models import Meeting
from app.db.session import engine
from app.services import analysis as analysis_service
from app.services import jobs as jobs_service
from app.services import notes as notes_service
from app.services import transcripts as transcripts_service
from app.services.audio import (
    AudioService,
    expected_chunk_count,
    get_audio_service,
)
from app.services.llm import LLMClient, LLMError, LLMValidationError, get_llm_client
from app.services.storage import (
    StorageService,
    get_storage_service,
    normalized_object_key,
)
from app.services.transcription import (
    Segment,
    Transcriber,
    get_transcriber,
    merge_segments,
)

logger = logging.getLogger(__name__)


class StageError(Exception):
    """Base class for stage failures."""


class TransientStageError(StageError):
    """Network/5xx/rate-limit style failure: worth retrying (ARCHITECTURE.md)."""


class PermanentStageError(StageError):
    """Bad input or unprocessable media: retrying will not help."""


@dataclass(frozen=True, slots=True)
class StageContext:
    """Services a stage needs. Injectable so tests swap fakes for ffmpeg/Whisper/S3/LLM."""

    storage: StorageService
    audio: AudioService
    transcriber: Transcriber
    llm: LLMClient


def default_context() -> StageContext:
    """Build the production context (boto3, ffmpeg, faster-whisper, Anthropic)."""
    return StageContext(
        storage=get_storage_service(),
        audio=get_audio_service(),
        transcriber=get_transcriber(),
        llm=get_llm_client(),
    )


@dataclass(frozen=True, slots=True)
class Stage:
    """One pipeline step: its job stage, the meeting status it implies, and its work."""

    name: JobStage
    sets_status: MeetingStatus
    run: Callable[[AsyncSession, Meeting, StageContext], Awaitable[None]]


def run_sync(action: Callable[[AsyncSession], Awaitable[Any]]) -> Any:
    """Run async ORM work from a sync Celery caller on a private event loop.

    asyncpg connections are bound to the loop that created them, so the engine's pool is
    disposed when the loop closes (see the `finally`).
    """
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _inner() -> Any:
        async with factory() as session:
            return await action(session)

    async def _run_and_dispose() -> Any:
        try:
            return await _inner()
        finally:
            with contextlib.suppress(Exception):
                await engine.dispose()

    return asyncio.run(_run_and_dispose())


async def load_meeting(session: AsyncSession, meeting_id: uuid.UUID) -> Meeting:
    """Load a meeting or raise a permanent error if it no longer exists."""
    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        raise PermanentStageError(f"Meeting {meeting_id} no longer exists")
    return meeting


async def set_status(
    session: AsyncSession,
    meeting: Meeting,
    status: MeetingStatus,
    error: str | None = None,
) -> None:
    """Commit a meeting status change together with its `jobs` row update."""
    meeting.status = status
    meeting.error_message = error

    job = await jobs_service.get_or_create_job(session, meeting.id)
    job.stage = status_to_stage(status).value
    if status is MeetingStatus.FAILED:
        await jobs_service.mark_failed(session, job, error or "processing failed")
    elif status is MeetingStatus.DONE:
        await jobs_service.mark_succeeded(session, job)
    else:
        await jobs_service.mark_running(session, job)
    await session.commit()


def status_to_stage(status: MeetingStatus) -> JobStage:
    """Map a meeting status to the job stage that produces it."""
    return {
        MeetingStatus.PREPARING: JobStage.PREPARE,
        MeetingStatus.TRANSCRIBING: JobStage.TRANSCRIBE,
        MeetingStatus.ANALYZING: JobStage.ANALYZE,
        MeetingStatus.DONE: JobStage.FINALIZE,
    }.get(status, JobStage.PREPARE)


def job_workdir(meeting_id: uuid.UUID) -> Path:
    """Per-job temp directory, always removed by the finalize stage (D33)."""
    return Path(get_settings().worker_temp_dir) / str(meeting_id)


# --------------------------------------------------------------------------- prepare


def _prepare_audio(meeting: Meeting, ctx: StageContext, workdir: Path) -> tuple[str, float]:
    """Download the original, normalize to 16 kHz mono WAV, upload it.

    Returns `(normalized_key, duration_sec)`. Idempotent: if the normalized object already
    exists in S3 the download/convert is skipped (D34).
    """
    if meeting.audio_key is None:
        raise PermanentStageError("Meeting has no uploaded audio")

    normalized_key = normalized_object_key(str(meeting.user_id), str(meeting.id))
    workdir.mkdir(parents=True, exist_ok=True)

    try:
        if not ctx.storage.object_exists(normalized_key):
            source = workdir / "original"
            ctx.storage.download_to_file(meeting.audio_key, source)

            duration = ctx.audio.probe_duration(source)
            normalized = workdir / "normalized.wav"
            try:
                ctx.audio.normalize(source, normalized)
            except Exception as exc:  # noqa: BLE001 - ffmpeg failures are permanent
                raise PermanentStageError(f"Could not read audio: {exc}") from exc

            ctx.storage.upload_file(normalized_key, normalized, "audio/wav")
        else:
            duration = _duration_from_probe(meeting, ctx, workdir)
    except PermanentStageError:
        raise
    except Exception as exc:  # noqa: BLE001 - S3/network issues are retryable
        raise TransientStageError(f"Audio preparation failed: {exc}") from exc

    return normalized_key, duration


def _duration_from_probe(meeting: Meeting, ctx: StageContext, workdir: Path) -> float:
    """Recover the duration when the normalized object already exists (re-run path)."""
    if meeting.duration_sec is not None:
        return meeting.duration_sec
    source = workdir / "original"
    if meeting.audio_key and not source.exists():
        ctx.storage.download_to_file(meeting.audio_key, source)
    return ctx.audio.probe_duration(source)


async def _stage_prepare(session: AsyncSession, meeting: Meeting, ctx: StageContext) -> None:
    """Pipeline stage 1: normalize the uploaded audio and record its duration."""
    workdir = job_workdir(meeting.id)
    normalized_key, duration = await _to_thread(_prepare_audio, meeting, ctx, workdir)

    meeting.normalized_key = normalized_key
    meeting.duration_sec = duration
    await session.flush()
    logger.info(
        "Prepared audio",
        extra={"meeting_id": str(meeting.id), "duration_sec": duration},
    )


# ------------------------------------------------------------------------ transcribe


async def _stage_transcribe(session: AsyncSession, meeting: Meeting, ctx: StageContext) -> None:
    """Pipeline stage 2: produce and persist the merged transcript."""
    existing = await transcripts_service.get_transcript(session, meeting.id)
    if existing is not None:
        logger.info("Transcript already present; skipping", extra={"meeting_id": str(meeting.id)})
        return

    workdir = job_workdir(meeting.id)
    segments, language = await _to_thread(_transcribe_to_segments, meeting, ctx, workdir)

    await transcripts_service.save_transcript(
        session, meeting.id, segments=segments, model=ctx.transcriber.model_name
    )
    meeting.language = language
    await session.flush()
    logger.info(
        "Transcribed meeting",
        extra={"meeting_id": str(meeting.id), "segments": len(segments), "language": language},
    )


def _transcribe_to_segments(
    meeting: Meeting, ctx: StageContext, workdir: Path
) -> tuple[list[Segment], str | None]:
    """Chunk + transcribe in a worker thread; returns merged segments and a language."""
    settings = get_settings()
    if meeting.audio_key is None:
        raise PermanentStageError("Meeting has no uploaded audio")

    normalized = workdir / "normalized.wav"
    workdir.mkdir(parents=True, exist_ok=True)
    if not normalized.exists():
        source = workdir / "original"
        if not source.exists():
            ctx.storage.download_to_file(meeting.audio_key, source)
        ctx.audio.normalize(source, normalized)

    try:
        chunks = ctx.audio.chunk(
            normalized, workdir / "chunks", chunk_seconds=settings.audio_chunk_seconds
        )
    except Exception as exc:  # noqa: BLE001 - ffmpeg failures are permanent
        raise PermanentStageError(f"Could not split audio: {exc}") from exc

    results = []
    languages: list[str] = []
    try:
        for chunk in chunks:
            result = ctx.transcriber.transcribe(chunk.path, settings.transcribe_language or None)
            results.append(result)
            if result.language:
                languages.append(result.language)
    except Exception as exc:  # noqa: BLE001 - model failures are retryable
        raise TransientStageError(f"Transcription failed: {exc}") from exc

    merged = merge_segments(results, [chunk.start_sec for chunk in chunks])
    if not merged:
        raise PermanentStageError("No speech detected in the recording")
    return merged, (languages[0] if languages else None)


async def _to_thread(func: Callable[..., Any], *args: Any) -> Any:
    """Run blocking ffmpeg/Whisper/S3 work off the event loop."""
    return await asyncio.to_thread(func, *args)


# --------------------------------------------------------------------------- analyze


async def _stage_analyze(session: AsyncSession, meeting: Meeting, ctx: StageContext) -> None:
    """Pipeline stage 3: ask the LLM for summary, decisions, and action items.

    The transcript row must exist (the transcribe stage produces it). LLM/network failures
    are transient; a response that stays invalid after the one retry is permanent (D42).
    """
    transcript = await transcripts_service.get_transcript(session, meeting.id)
    if transcript is None:
        raise PermanentStageError("Cannot analyze a meeting without a transcript")

    segments = _segments_from_row(transcript.segments)
    if not segments:
        raise PermanentStageError("Cannot analyze an empty transcript")

    from app.schemas.analysis import MeetingAnalysis

    def _work() -> MeetingAnalysis:
        return analysis_service.analyze(
            llm=ctx.llm,
            segments=segments,
            meeting_date=analysis_service.meeting_date_for(meeting.created_at),
            language=meeting.language,
        )

    try:
        result = await _to_thread(_work)
    except LLMValidationError as exc:
        raise PermanentStageError(f"LLM returned unusable output: {exc}") from exc
    except LLMError as exc:
        raise TransientStageError(f"Analysis failed: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 - unexpected provider errors are retryable
        raise TransientStageError(f"Analysis failed: {exc}") from exc

    await notes_service.save_analysis(session, meeting, result, llm_model=ctx.llm.model_name)
    logger.info(
        "Analyzed meeting",
        extra={
            "meeting_id": str(meeting.id),
            "action_items": len(result.action_items),
            "model": ctx.llm.model_name,
        },
    )


def _segments_from_row(raw: list[dict[str, object]]) -> list[Segment]:
    """Rebuild `Segment`s from the stored JSONB payload (tolerant of older rows)."""
    segments: list[Segment] = []
    for item in raw:
        try:
            segments.append(
                Segment(
                    start=float(item["start"]),  # type: ignore[arg-type]
                    end=float(item["end"]),  # type: ignore[arg-type]
                    text=str(item["text"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return segments


# -------------------------------------------------------------------------- finalize


async def _stage_finalize(session: AsyncSession, meeting: Meeting, ctx: StageContext) -> None:
    """Pipeline stage 4: remove the per-job temp directory (D33)."""
    workdir = job_workdir(meeting.id)
    if workdir.exists():
        shutil.rmtree(workdir, ignore_errors=True)
    logger.info("Finalized meeting", extra={"meeting_id": str(meeting.id)})


def build_stages() -> list[Stage]:
    """The ordered pipeline, built per call so tests can monkeypatch stage functions."""
    return [
        Stage(JobStage.PREPARE, MeetingStatus.PREPARING, _stage_prepare),
        Stage(JobStage.TRANSCRIBE, MeetingStatus.TRANSCRIBING, _stage_transcribe),
        Stage(JobStage.ANALYZE, MeetingStatus.ANALYZING, _stage_analyze),
        Stage(JobStage.FINALIZE, MeetingStatus.DONE, _stage_finalize),
    ]


def stage_order() -> list[JobStage]:
    """Pipeline stage order (used by the progress mapping and tests)."""
    return [stage.name for stage in build_stages()]


async def run_stage(
    session: AsyncSession, meeting: Meeting, stage: Stage, ctx: StageContext | None = None
) -> None:
    """Enter a stage and run its work.

    A `PermanentStageError` marks the meeting `failed` here. A `TransientStageError` is
    left for the caller to retry, so the meeting keeps its in-progress status (which the
    retry re-enters) rather than looking permanently broken while retries are pending.
    """
    await set_status(session, meeting, stage.sets_status)
    resolved = ctx if ctx is not None else default_context()
    try:
        await stage.run(session, meeting, resolved)
    except PermanentStageError as exc:
        await set_status(session, meeting, MeetingStatus.FAILED, str(exc))
        raise
    except TransientStageError:
        raise


async def run_pipeline(
    session: AsyncSession,
    meeting_id: uuid.UUID,
    *,
    stages: list[JobStage] | None = None,
    ctx: StageContext | None = None,
) -> list[str]:
    """Run the pipeline stages for one meeting on the caller's session.

    Raises `StageError` on the first failure; the caller decides retry vs. fail. The
    meeting's status is updated as each stage is entered, so a re-run resumes safely.
    """
    ordered = stages if stages is not None else [stage.name for stage in build_stages()]
    for stage_name in ordered:
        stage = next(s for s in build_stages() if s.name is stage_name)
        meeting = await load_meeting(session, meeting_id)
        await run_stage(session, meeting, stage, ctx)
        await session.commit()
    return [stage.value for stage in ordered]


def pipeline_settings_snapshot() -> dict[str, int]:
    """Settings the pipeline depends on; handy for logging and debugging."""
    settings = get_settings()
    return {
        "max_retries": settings.pipeline_max_retries,
        "stuck_minutes": settings.stuck_meeting_minutes,
        "chunk_seconds": settings.audio_chunk_seconds,
    }


__all__ = [
    "AudioService",
    "PermanentStageError",
    "Stage",
    "StageContext",
    "StageError",
    "TransientStageError",
    "build_stages",
    "default_context",
    "expected_chunk_count",
    "job_workdir",
    "run_pipeline",
    "run_stage",
    "run_sync",
    "stage_order",
    "status_to_stage",
]
