import logging
from pathlib import Path
from typing import Any, List, Optional, Protocol, Tuple

from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.audio import AudioService

logger = logging.getLogger(__name__)


class Segment(BaseModel):
    id: int
    start: float = Field(..., description="Start time in seconds")
    end: float = Field(..., description="End time in seconds")
    text: str = Field(..., description="Transcribed segment text")


class TranscriptResult(BaseModel):
    language: str = "en"
    full_text: str
    segments: List[Segment] = Field(default_factory=list)


class Transcriber(Protocol):
    def transcribe(self, wav_path: Path, language: Optional[str] = None) -> TranscriptResult: ...


class FasterWhisperTranscriber:
    _model_instance = None
    _model_name = None

    @classmethod
    def get_model(cls) -> Any:
        # Cache model instance in memory across calls in the worker process
        if cls._model_instance is None or cls._model_name != settings.WHISPER_MODEL:
            from faster_whisper import WhisperModel

            logger.info(
                "Loading faster-whisper model: %s on device=%s, compute_type=%s",
                settings.WHISPER_MODEL,
                settings.WHISPER_DEVICE,
                settings.WHISPER_COMPUTE_TYPE,
            )
            cls._model_instance = WhisperModel(
                settings.WHISPER_MODEL,
                device=settings.WHISPER_DEVICE,
                compute_type=settings.WHISPER_COMPUTE_TYPE,
                cpu_threads=1,
                num_workers=1,
            )
            cls._model_name = settings.WHISPER_MODEL
        return cls._model_instance

    def transcribe(self, wav_path: Path, language: Optional[str] = None) -> TranscriptResult:
        model = self.get_model()
        logger.info("Transcribing %s with faster-whisper", wav_path)

        segments_generator, info = model.transcribe(
            str(wav_path),
            vad_filter=True,
            language=language,
        )

        segments: List[Segment] = []
        texts: List[str] = []

        for idx, s in enumerate(segments_generator):
            cleaned = s.text.strip()
            if cleaned:
                segments.append(
                    Segment(
                        id=idx,
                        start=round(float(s.start), 2),
                        end=round(float(s.end), 2),
                        text=cleaned,
                    )
                )
                texts.append(cleaned)

        detected_lang = info.language if info and info.language else (language or "en")
        full_text = " ".join(texts)

        return TranscriptResult(
            language=detected_lang,
            full_text=full_text,
            segments=segments,
        )


class OpenAITranscriber:
    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key or settings.LLM_API_KEY

    def transcribe(self, wav_path: Path, language: Optional[str] = None) -> TranscriptResult:
        try:
            from openai import OpenAI
        except ImportError as e:
            raise RuntimeError("openai package is required for OpenAITranscriber") from e

        client = OpenAI(api_key=self.api_key)
        with open(wav_path, "rb") as f:
            kwargs = {
                "model": "whisper-1",
                "file": f,
                "response_format": "verbose_json",
            }
            if language:
                kwargs["language"] = language

            transcript = client.audio.transcriptions.create(**kwargs)

        segments: List[Segment] = []
        texts: List[str] = []

        raw_segments = getattr(transcript, "segments", []) or []
        for idx, seg in enumerate(raw_segments):
            raw_text = seg.get("text") if isinstance(seg, dict) else getattr(seg, "text", "")
            text = str(raw_text or "").strip()
            raw_start = seg.get("start") if isinstance(seg, dict) else getattr(seg, "start", 0.0)
            raw_end = seg.get("end") if isinstance(seg, dict) else getattr(seg, "end", 0.0)
            start = float(raw_start or 0.0)
            end = float(raw_end or 0.0)
            if text:
                segments.append(
                    Segment(id=idx, start=round(start, 2), end=round(end, 2), text=text)
                )
                texts.append(text)

        detected_lang = getattr(transcript, "language", language or "en")
        full_text = getattr(transcript, "text", " ".join(texts))

        return TranscriptResult(
            language=detected_lang,
            full_text=full_text,
            segments=segments,
        )


class FakeTranscriber:
    def transcribe(self, wav_path: Path, language: Optional[str] = None) -> TranscriptResult:
        """
        Deterministic mock transcriber for test suites and offline pipeline execution.
        Returns the standard meeting script with realistic timestamps.
        Throws if filename contains 'fail' to support testing failure paths.
        """
        if "fail" in str(wav_path).lower():
            raise RuntimeError(f"Simulated transcription failure for {wav_path.name}")

        try:
            info = AudioService.probe_audio(wav_path)
            duration = info["duration_sec"]
        except Exception:
            duration = 20.0

        step = max(1.0, duration / 4.0)

        segments = [
            Segment(
                id=0,
                start=0.0,
                end=round(step, 2),
                text="Welcome to the weekly sync. We decided to ship the beta on November fifteenth.",
            ),
            Segment(
                id=1,
                start=round(step, 2),
                end=round(step * 2, 2),
                text="Action item: Priya will update the API documentation by Friday.",
            ),
            Segment(
                id=2,
                start=round(step * 2, 2),
                end=round(step * 3, 2),
                text="Action item: Ravi should fix the login bug as soon as possible.",
            ),
            Segment(
                id=3,
                start=round(step * 3, 2),
                end=round(duration, 2),
                text="That is everything for today. Thanks everyone.",
            ),
        ]

        full_text = " ".join(s.text for s in segments)
        return TranscriptResult(language=language or "en", full_text=full_text, segments=segments)


def merge_chunk_transcripts(
    chunk_results: List[Tuple[TranscriptResult, float]],
) -> TranscriptResult:
    """
    Merges multiple chunk transcription results into a single unified TranscriptResult.
    Applies the chunk offset to every segment's start and end timestamps, and re-indexes segment IDs.
    """
    if not chunk_results:
        return TranscriptResult(language="en", full_text="", segments=[])

    merged_segments: List[Segment] = []
    all_texts: List[str] = []
    current_id = 0
    primary_language = chunk_results[0][0].language

    for res, offset_sec in chunk_results:
        for seg in res.segments:
            adjusted_start = round(seg.start + offset_sec, 2)
            adjusted_end = round(seg.end + offset_sec, 2)
            merged_segments.append(
                Segment(
                    id=current_id,
                    start=adjusted_start,
                    end=adjusted_end,
                    text=seg.text,
                )
            )
            all_texts.append(seg.text)
            current_id += 1

    full_text = " ".join(all_texts)
    return TranscriptResult(
        language=primary_language,
        full_text=full_text,
        segments=merged_segments,
    )


def get_transcriber() -> Transcriber:
    if settings.TRANSCRIBER == "fake":
        return FakeTranscriber()
    if settings.TRANSCRIBER == "openai":
        return OpenAITranscriber()
    return FasterWhisperTranscriber()
