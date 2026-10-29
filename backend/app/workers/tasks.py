import logging
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from celery import Task
from sqlalchemy import func, select, update

from app.core.config import settings
from app.db.models import Job, Meeting, Transcript
from app.db.session import get_sync_db
from app.services.analysis import AnalysisService
from app.services.audio import AudioService
from app.services.storage import get_storage_service
from app.services.transcription import get_transcriber, merge_chunk_transcripts
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    name="app.workers.tasks.process_meeting",
    acks_late=True,
    max_retries=3,
    default_retry_delay=5,
)
def process_meeting(self: Task, meeting_id_str: str) -> dict[str, Any]:
    """
    Main processing pipeline for meeting audio:
    1. prepare_audio: ffmpeg normalize to 16kHz mono WAV, probe duration, chunking
    2. transcribe: Whisper speech-to-text with segment timestamps & language detection
    3. analyze: LLM summary, decisions, action items (stub in Phase 4, Phase 5 replaces)
    4. finalize: save notes and mark meeting done
    """
    meeting_uuid = uuid.UUID(meeting_id_str)
    session = get_sync_db()
    job_id: uuid.UUID | None = None
    work_dir: Path | None = None

    try:
        # 1. Idempotent claim: atomically transition from queued/failed to preparing
        stmt = (
            update(Meeting)
            .where(
                Meeting.id == meeting_uuid,
                Meeting.status.in_(["queued", "failed"]),
            )
            .values(
                status="preparing",
                stage="audio_processing",
                progress_pct=15.0,
                process_attempts=Meeting.process_attempts + 1,
                error_message=None,
                updated_at=func.now(),
            )
            .returning(Meeting)
        )
        meeting = session.execute(stmt).scalar_one_or_none()

        if not meeting:
            logger.info(
                "Meeting %s could not be claimed (already processing, done, or not found)",
                meeting_id_str,
            )
            return {"status": "skipped", "meeting_id": meeting_id_str}

        # 2. Record Job execution
        job = Job(
            meeting_id=meeting.id,
            celery_task_id=self.request.id if self.request else None,
            stage="audio_processing",
            status="processing",
            attempts=meeting.process_attempts,
            started_at=datetime.now(timezone.utc),
        )
        session.add(job)
        session.commit()
        job_id = job.id

        # 3. Setup temporary local workspace
        work_dir = Path(tempfile.mkdtemp(prefix=f"meeting_{meeting.id}_"))
        storage = get_storage_service()

        # --- Stage 1: Audio Preparation (Download, Probe, Normalize, Upload) ---
        logger.info("Meeting %s: Audio preparation stage started", meeting_id_str)
        if not meeting.audio_key:
            raise ValueError(f"Meeting {meeting.id} does not have an audio_key")

        # Download original file
        ext = Path(meeting.audio_key).suffix or ".mp3"
        local_orig_path = work_dir / f"original{ext}"
        storage.download_to(meeting.audio_key, local_orig_path)

        # Probe duration and metadata
        audio_info = AudioService.probe_audio(local_orig_path)
        duration_sec = audio_info["duration_sec"]

        # Normalize to 16 kHz mono WAV
        normalized_wav_path = work_dir / "normalized.wav"
        AudioService.normalize(local_orig_path, normalized_wav_path)

        # Upload normalized audio to storage
        normalized_key = f"uploads/{meeting.user_id}/{meeting.id}/normalized.wav"
        storage.upload_from(normalized_key, normalized_wav_path, content_type="audio/wav")

        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting.id)
            .values(
                duration_sec=duration_sec,
                normalized_key=normalized_key,
                progress_pct=25.0,
                updated_at=func.now(),
            )
        )
        session.commit()

        # --- Stage 2: Transcription (Chunking, Transcribing, Offsets & DB Save) ---
        logger.info("Meeting %s: Transcription stage started", meeting_id_str)
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting.id)
            .values(
                status="transcribing",
                stage="transcription",
                progress_pct=30.0,
                updated_at=func.now(),
            )
        )
        session.execute(
            update(Job).where(Job.id == job_id).values(stage="transcription", updated_at=func.now())
        )
        session.commit()

        # Chunk audio if longer than 30 minutes (1800s)
        chunk_dir = work_dir / "chunks"
        chunks = AudioService.chunk_audio(normalized_wav_path, chunk_dir, chunk_duration_sec=600)
        num_chunks = len(chunks)

        transcriber = get_transcriber()
        chunk_results = []

        for idx, (chunk_path, offset_sec) in enumerate(chunks):
            logger.info(
                "Transcribing chunk %d/%d (offset %.1fs): %s",
                idx + 1,
                num_chunks,
                offset_sec,
                chunk_path.name,
            )
            result = transcriber.transcribe(chunk_path)
            chunk_results.append((result, offset_sec))

            # Progress increments from 30% to 70% across chunks
            progress = round(30.0 + (40.0 * (idx + 1) / num_chunks), 1)
            session.execute(
                update(Meeting)
                .where(Meeting.id == meeting.id)
                .values(progress_pct=progress, updated_at=func.now())
            )
            session.commit()

        # Merge segments across all chunks with proper time offsets
        unified_transcript = merge_chunk_transcripts(chunk_results)

        # Upsert transcript row (tsvector trigger handles full_text search indexing automatically)
        transcript_row = session.execute(
            select(Transcript).where(Transcript.meeting_id == meeting.id)
        ).scalar_one_or_none()

        segments_data = [s.model_dump() for s in unified_transcript.segments]
        if not transcript_row:
            transcript_row = Transcript(
                meeting_id=meeting.id,
                full_text=unified_transcript.full_text,
                segments=segments_data,
                model=settings.TRANSCRIBER,
            )
            session.add(transcript_row)
        else:
            transcript_row.full_text = unified_transcript.full_text
            transcript_row.segments = segments_data
            transcript_row.model = settings.TRANSCRIBER

        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting.id)
            .values(
                language=unified_transcript.language,
                updated_at=func.now(),
            )
        )
        session.commit()

        # --- Stage 3: LLM Analysis (Summary, Decisions, Action Items, Title) ---
        logger.info("Meeting %s: Analysis stage started", meeting_id_str)
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting.id)
            .values(
                status="analyzing",
                stage="summarization",
                progress_pct=75.0,
                updated_at=func.now(),
            )
        )
        session.execute(
            update(Job).where(Job.id == job_id).values(stage="summarization", updated_at=func.now())
        )
        session.commit()

        analysis_service = AnalysisService()
        analysis = analysis_service.analyze_transcript(transcript_row, meeting)

        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting.id)
            .values(
                progress_pct=90.0,
                updated_at=func.now(),
            )
        )
        session.commit()

        # Save analysis into summaries and action_items tables
        analysis_service.save_analysis(session, meeting, analysis)

        # --- Stage 4: Finalize & Done ---
        logger.info("Meeting %s: Finalizing pipeline", meeting_id_str)
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting.id)
            .values(
                status="done",
                stage=None,
                progress_pct=100.0,
                error_message=None,
                updated_at=func.now(),
            )
        )
        session.execute(
            update(Job)
            .where(Job.id == job_id)
            .values(
                status="done",
                finished_at=datetime.now(timezone.utc),
                updated_at=func.now(),
            )
        )
        session.commit()

        logger.info("Meeting %s processed successfully", meeting_id_str)
        return {"status": "done", "meeting_id": meeting_id_str}

    except Exception as exc:
        session.rollback()
        logger.exception("Error processing meeting %s: %s", meeting_id_str, exc)
        err_msg = str(exc)

        # Mark meeting as failed
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting_uuid)
            .values(
                status="failed",
                error_message=err_msg,
                updated_at=func.now(),
            )
        )

        if job_id:
            session.execute(
                update(Job)
                .where(Job.id == job_id)
                .values(
                    status="failed",
                    error=err_msg,
                    finished_at=datetime.now(timezone.utc),
                    updated_at=func.now(),
                )
            )
        session.commit()

        # Retry transient exceptions if retries remain
        if (
            isinstance(exc, (ConnectionError, TimeoutError, OSError))
            and self.request
            and self.request.retries < self.max_retries
        ):
            raise self.retry(exc=exc)
        raise

    finally:
        if work_dir and work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
        session.close()
