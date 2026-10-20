"""Audio processing (ARCHITECTURE.md): duration probe, normalization, chunking.

Every ffmpeg/ffprobe call goes through `AudioService` so it can be faked in tests (AGENTS.md
rule 3). Nothing here touches S3 or the database — the pipeline stage wires those together.
"""

import json
import logging
import math
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

logger = logging.getLogger(__name__)

# Normalization target (ARCHITECTURE.md): 16 kHz mono WAV, ideal for Whisper.
TARGET_SAMPLE_RATE = 16_000
TARGET_CHANNELS = 1

# A single Whisper pass is fastest on ~30-minute windows; long meetings are split so the
# model never sees an unbounded input (D31).
DEFAULT_CHUNK_SECONDS = 30 * 60


class AudioError(Exception):
    """Raised when media cannot be probed or converted."""


@dataclass(frozen=True, slots=True)
class AudioChunk:
    """A normalized chunk on disk plus the offset it starts at in the full recording."""

    path: Path
    start_sec: float
    index: int = 0


class AudioService(Protocol):
    """Audio operations the pipeline needs; implementations are mockable in tests."""

    def probe_duration(self, path: Path) -> float: ...

    def normalize(self, source: Path, destination: Path) -> None: ...

    def chunk(self, source: Path, workdir: Path, *, chunk_seconds: int) -> list[AudioChunk]: ...


class FFmpegAudioService:
    """ffprobe/ffmpeg-backed implementation. Requires the `ffmpeg` binaries on PATH."""

    def __init__(self, *, timeout_sec: int = 60 * 30) -> None:
        self._timeout = timeout_sec

    def probe_duration(self, path: Path) -> float:
        """Return media duration in seconds using ffprobe."""
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ]
        try:
            result = subprocess.run(  # noqa: S603 - fixed argv, no shell
                cmd, capture_output=True, text=True, timeout=self._timeout, check=False
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise AudioError(f"ffprobe failed: {exc}") from exc
        if result.returncode != 0:
            raise AudioError(f"ffprobe rejected the file: {result.stderr.strip()[:300]}")

        try:
            payload = json.loads(result.stdout or "{}")
            duration = float(payload["format"]["duration"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AudioError("ffprobe returned no duration") from exc
        if not math.isfinite(duration) or duration < 0:
            raise AudioError("ffprobe returned a non-finite duration")
        return duration

    def normalize(self, source: Path, destination: Path) -> None:
        """Convert any input to 16 kHz mono PCM WAV at `destination`."""
        destination.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-vn",  # drop video: only audio is needed
            "-ac",
            str(TARGET_CHANNELS),
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-acodec",
            "pcm_s16le",
            "-f",
            "wav",
            str(destination),
        ]
        self._run_ffmpeg(cmd, action="normalize")

    def chunk(self, source: Path, workdir: Path, *, chunk_seconds: int) -> list[AudioChunk]:
        """Split `source` into `chunk_seconds` windows with exact, non-overlapping offsets.

        Implemented with ffmpeg's segment muxer starting at a fixed `-ss 0`, so segment `i`
        covers `[i * chunk_seconds, (i + 1) * chunk_seconds)`. The recorded offset is the
        nominal window start, which keeps merged timestamps aligned with the full recording
        (D32).
        """
        workdir.mkdir(parents=True, exist_ok=True)
        duration = self.probe_duration(source)
        if duration <= chunk_seconds:
            single = workdir / "chunk_000.wav"
            self.normalize(source, single)
            return [AudioChunk(path=single, start_sec=0.0)]

        pattern = str(workdir / "chunk_%03d.wav")
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-vn",
            "-ac",
            str(TARGET_CHANNELS),
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-acodec",
            "pcm_s16le",
            "-f",
            "segment",
            "-segment_time",
            str(chunk_seconds),
            "-reset_timestamps",
            "1",
            pattern,
        ]
        self._run_ffmpeg(cmd, action="chunk")

        files = sorted(workdir.glob("chunk_*.wav"))
        if not files:
            raise AudioError("ffmpeg produced no chunks")
        return [
            AudioChunk(path=file, start_sec=index * chunk_seconds, index=index)
            for index, file in enumerate(files)
        ]

    def _run_ffmpeg(self, cmd: Sequence[str], *, action: str) -> None:
        try:
            result = subprocess.run(  # noqa: S603 - fixed argv, no shell
                list(cmd), capture_output=True, text=True, timeout=self._timeout, check=False
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise AudioError(f"ffmpeg {action} failed: {exc}") from exc
        if result.returncode != 0:
            raise AudioError(f"ffmpeg {action} failed: {result.stderr.strip()[:300]}")


def get_audio_service() -> AudioService:
    """Factory for the configured audio service (only one implementation for now)."""
    return FFmpegAudioService()


def expected_chunk_count(duration_sec: float, chunk_seconds: int) -> int:
    """How many chunks a recording of this duration will produce (used for progress)."""
    if duration_sec <= 0 or chunk_seconds <= 0:
        return 1
    return max(1, math.ceil(duration_sec / chunk_seconds))
