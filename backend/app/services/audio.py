import json
import logging
import subprocess
from pathlib import Path
from typing import Any, List, Tuple

logger = logging.getLogger(__name__)


class AudioService:
    @staticmethod
    def probe_audio(path: Path) -> dict[str, Any]:
        """
        Uses ffprobe to extract audio duration, format, sample rate, and channels.
        Raises ValueError if audio cannot be decoded or has 0 duration.
        """
        if not path.is_file():
            raise FileNotFoundError(f"Audio file not found: {path}")

        if path.stat().st_size == 0:
            raise ValueError(f"Audio file is empty: {path}")

        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ]

        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            info = json.loads(res.stdout)
        except (subprocess.CalledProcessError, json.JSONDecodeError) as e:
            logger.error("ffprobe failed on %s: %s", path, e)
            raise ValueError(f"Failed to probe audio file: {e}") from e

        # Extract audio stream info
        audio_stream = next(
            (s for s in info.get("streams", []) if s.get("codec_type") == "audio"),
            None,
        )

        format_info = info.get("format", {})
        duration_str = (
            audio_stream.get("duration")
            if audio_stream and audio_stream.get("duration")
            else format_info.get("duration")
        )

        if not duration_str:
            raise ValueError("Could not determine audio duration")

        try:
            duration = float(duration_str)
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid duration string '{duration_str}'") from e

        if duration <= 0:
            raise ValueError(f"Audio duration must be greater than zero, got {duration}")

        sample_rate = int(audio_stream.get("sample_rate", 0)) if audio_stream else 0
        channels = int(audio_stream.get("channels", 0)) if audio_stream else 0

        return {
            "duration_sec": duration,
            "sample_rate": sample_rate,
            "channels": channels,
            "format_name": format_info.get("format_name", ""),
            "bit_rate": int(format_info.get("bit_rate", 0))
            if format_info.get("bit_rate")
            else None,
        }

    @staticmethod
    def normalize(input_path: Path, output_path: Path) -> None:
        """
        Normalizes input audio to 16 kHz mono PCM 16-bit WAV using ffmpeg.
        """
        if not input_path.is_file():
            raise FileNotFoundError(f"Input audio file not found: {input_path}")

        output_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]

        try:
            subprocess.run(cmd, capture_output=True, text=True, check=True)
        except subprocess.CalledProcessError as e:
            logger.error("ffmpeg normalization failed: %s (stderr: %s)", e, e.stderr)
            raise RuntimeError(f"FFmpeg normalization failed: {e.stderr}") from e

    @classmethod
    def chunk_audio(
        cls, wav_path: Path, output_dir: Path, chunk_duration_sec: int = 600
    ) -> List[Tuple[Path, float]]:
        """
        Splits audio longer than 30 minutes (1800s) into sequential 10-minute (600s) chunks.
        Returns a list of tuples: (chunk_file_path, offset_seconds).
        For files <= 30 minutes, returns [(wav_path, 0.0)].
        """
        info = cls.probe_audio(wav_path)
        total_duration = info["duration_sec"]

        # Only chunk if longer than 30 minutes (1800s)
        if total_duration <= 1800.0:
            return [(wav_path, 0.0)]

        output_dir.mkdir(parents=True, exist_ok=True)
        chunks: List[Tuple[Path, float]] = []

        current_offset = 0.0
        chunk_idx = 0

        while current_offset < total_duration:
            duration_to_read = min(float(chunk_duration_sec), total_duration - current_offset)
            chunk_file = output_dir / f"chunk_{chunk_idx:03d}.wav"

            cmd = [
                "ffmpeg",
                "-y",
                "-ss",
                str(current_offset),
                "-t",
                str(duration_to_read),
                "-i",
                str(wav_path),
                "-c",
                "copy",
                str(chunk_file),
            ]

            try:
                subprocess.run(cmd, capture_output=True, text=True, check=True)
            except subprocess.CalledProcessError as e:
                logger.error("ffmpeg chunking failed at offset %f: %s", current_offset, e)
                raise RuntimeError(f"FFmpeg chunking failed: {e.stderr}") from e

            chunks.append((chunk_file, current_offset))
            current_offset += float(chunk_duration_sec)
            chunk_idx += 1

        return chunks
