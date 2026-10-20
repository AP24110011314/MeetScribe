"""Transcription (ARCHITECTURE.md).

`Transcriber` is the seam: the default is local faster-whisper, and the OpenAI Whisper API
is an optional provider (D6). Everything is lazy about heavy imports so unit tests never
download a model or load torch (D7).
"""

import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    """Raised when a transcriber cannot produce a result."""


@dataclass(frozen=True, slots=True)
class Segment:
    """One transcript segment, in seconds relative to the start of the audio it came from."""

    start: float
    end: float
    text: str


@dataclass(frozen=True, slots=True)
class TranscriptResult:
    """Result of transcribing one audio file (a chunk, or a whole normalized recording)."""

    language: str | None
    duration: float
    segments: list[Segment]


class Transcriber(Protocol):
    """Turns a WAV file into timestamped segments."""

    @property
    def model_name(self) -> str: ...

    def transcribe(self, wav_path: Path, language: str | None = None) -> TranscriptResult: ...


def merge_segments(
    per_chunk: Sequence[TranscriptResult],
    offsets: Sequence[float],
) -> list[Segment]:
    """Merge chunk results into one segment list, shifting each chunk by its offset.

    `offsets[i]` is the start time of chunk `i` within the full recording. Shifting every
    segment by its chunk's offset yields timestamps relative to the whole recording, which
    is what F4 and the audio-player seek need (D32).
    """
    if len(per_chunk) != len(offsets):
        raise ValueError("per_chunk and offsets must have the same length")

    merged: list[Segment] = []
    for result, offset in zip(per_chunk, offsets, strict=True):
        for segment in result.segments:
            text = segment.text.strip()
            if not text:
                continue
            merged.append(
                Segment(start=segment.start + offset, end=segment.end + offset, text=text)
            )
    merged.sort(key=lambda s: s.start)
    return merged


def full_text_from_segments(segments: Iterable[Segment]) -> str:
    """Join segment texts with a single space; the DB tsvector is generated from this."""
    return " ".join(segment.text for segment in segments).strip()


class FasterWhisperTranscriber:
    """Local faster-whisper transcriber. One model instance is cached per worker process.

    `faster_whisper` and its model weights are imported/loaded lazily, on first use, so the
    API process and the test suite never pay that cost (D7/D35).
    """

    def __init__(
        self,
        *,
        model_size: str,
        device: str,
        compute_type: str,
        language: str | None = None,
    ) -> None:
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._language = language
        self._model: object | None = None  # WhisperModel, imported lazily

    @property
    def model_name(self) -> str:
        return f"faster-whisper-{self._model_size}"

    def _get_model(self) -> object:
        if self._model is None:
            from faster_whisper import WhisperModel  # local import: heavy, optional in tests

            logger.info(
                "Loading faster-whisper model",
                extra={"model": self._model_size, "device": self._device},
            )
            self._model = WhisperModel(
                self._model_size, device=self._device, compute_type=self._compute_type
            )
        return self._model

    def transcribe(self, wav_path: Path, language: str | None = None) -> TranscriptResult:
        model = self._get_model()
        try:
            raw_segments, info = model.transcribe(  # type: ignore[attr-defined]
                str(wav_path),
                language=language or self._language,
                vad_filter=True,
            )
            segments = [
                Segment(start=float(s.start), end=float(s.end), text=str(s.text))
                for s in raw_segments
            ]
        except Exception as exc:  # framework-specific errors vary; normalise them
            raise TranscriptionError(f"faster-whisper failed: {exc}") from exc
        return TranscriptResult(
            language=getattr(info, "language", None),
            duration=float(getattr(info, "duration", 0.0) or 0.0),
            segments=segments,
        )


class OpenAIWhisperTranscriber:
    """Optional OpenAI Whisper API transcriber (D6). Not the default; requires an API key.

    The API hard-caps uploads at 25 MB, so callers must chunk audio first
    (ARCHITECTURE.md). This class only handles a single already-sized file.
    """

    def __init__(
        self, *, api_key: str, model: str = "whisper-1", language: str | None = None
    ) -> None:
        if not api_key:
            raise TranscriptionError("OPENAI_API_KEY is required for the OpenAI transcriber")
        self._api_key = api_key
        self._model = model
        self._language = language

    @property
    def model_name(self) -> str:
        return f"openai-{self._model}"

    def transcribe(self, wav_path: Path, language: str | None = None) -> TranscriptResult:
        from openai import OpenAI  # local import: optional dependency

        if wav_path.stat().st_size > 25 * 1024 * 1024:
            raise TranscriptionError("File exceeds the OpenAI Whisper 25 MB limit; chunk first")

        client = OpenAI(api_key=self._api_key)
        try:
            with wav_path.open("rb") as handle:
                response = client.audio.transcriptions.create(
                    model=self._model,
                    file=handle,
                    response_format="verbose_json",
                    language=language or self._language,
                )
        except Exception as exc:
            raise TranscriptionError(f"OpenAI Whisper failed: {exc}") from exc

        segments = [
            Segment(start=float(s.start), end=float(s.end), text=str(s.text))
            for s in getattr(response, "segments", []) or []
        ]
        return TranscriptResult(
            language=getattr(response, "language", None),
            duration=float(getattr(response, "duration", 0.0) or 0.0),
            segments=segments,
        )


def get_transcriber() -> Transcriber:
    """Build the configured transcriber. Defaults to local faster-whisper (AGENTS.md)."""
    settings = get_settings()
    language = settings.transcribe_language or None
    if settings.transcriber == "openai":
        return OpenAIWhisperTranscriber(
            api_key=settings.openai_api_key,
            model=settings.openai_whisper_model,
            language=language,
        )
    if settings.transcriber != "faster_whisper":
        logger.warning("Unknown TRANSCRIBER %r; using faster_whisper", settings.transcriber)
    return FasterWhisperTranscriber(
        model_size=settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
        language=language,
    )
