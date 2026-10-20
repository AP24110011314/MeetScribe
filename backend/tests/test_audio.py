"""Audio service unit tests (Phase 4).

ffmpeg itself is not available on every dev machine and must not run in unit tests, so the
pure helpers are tested here (`merge_segments`/chunk math) and the real ffmpeg path is
exercised during `docker compose` verification. `FFmpegAudioService` is covered for its
error handling with a stubbed subprocess.
"""

import math
import subprocess
from pathlib import Path

import pytest

from app.services.audio import (
    AudioChunk,
    AudioError,
    FFmpegAudioService,
    expected_chunk_count,
)


def test_expected_chunk_count_short_recording() -> None:
    assert expected_chunk_count(60.0, 1800) == 1


def test_expected_chunk_count_splits_long_recording() -> None:
    assert expected_chunk_count(3600.0, 1800) == 2
    assert expected_chunk_count(1800.0, 1800) == 1
    assert expected_chunk_count(1801.0, 1800) == 2


def test_expected_chunk_count_handles_degenerate_input() -> None:
    assert expected_chunk_count(0.0, 1800) == 1
    assert expected_chunk_count(-5.0, 1800) == 1
    assert expected_chunk_count(10.0, 0) == 1


def test_chunk_offsets_are_exact_multiples() -> None:
    """Chunk start offsets must be exact window boundaries, so timestamps line up (D32)."""
    chunks = [
        AudioChunk(path=Path(f"/tmp/c{index}.wav"), start_sec=index * 1800, index=index)
        for index in range(3)
    ]
    assert [c.start_sec for c in chunks] == [0.0, 1800.0, 3600.0]
    assert [c.index for c in chunks] == [0, 1, 2]


def test_probe_duration_parses_ffprobe_json(monkeypatch: pytest.MonkeyPatch) -> None:
    service = FFmpegAudioService()

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            args=[], returncode=0, stdout='{"format": {"duration": "1832.4"}}', stderr=""
        )

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert service.probe_duration(Path("/tmp/a.wav")) == pytest.approx(1832.4)


def test_probe_duration_rejects_missing_duration(monkeypatch: pytest.MonkeyPatch) -> None:
    service = FFmpegAudioService()

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(args=[], returncode=0, stdout="{}", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(AudioError, match="no duration"):
        service.probe_duration(Path("/tmp/a.wav"))


def test_probe_duration_raises_on_ffprobe_error(monkeypatch: pytest.MonkeyPatch) -> None:
    service = FFmpegAudioService()

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr="bad file")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(AudioError, match="rejected the file"):
        service.probe_duration(Path("/tmp/a.wav"))


def test_normalize_builds_16khz_mono_command(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    service = FFmpegAudioService()
    captured: dict[str, list[str]] = {}

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured["cmd"] = cmd
        (tmp_path / "out.wav").write_bytes(b"wav")
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    service.normalize(tmp_path / "in.mp3", tmp_path / "out.wav")

    cmd = captured["cmd"]
    assert cmd[0] == "ffmpeg"
    assert "-vn" in cmd
    assert cmd[cmd.index("-ac") + 1] == "1"
    assert cmd[cmd.index("-ar") + 1] == "16000"
    assert cmd[cmd.index("-acodec") + 1] == "pcm_s16le"


def test_normalize_raises_on_ffmpeg_failure(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    service = FFmpegAudioService()

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr="boom")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(AudioError, match="normalize failed"):
        service.normalize(tmp_path / "in.mp3", tmp_path / "out.wav")


def test_chunk_produces_single_file_for_short_audio(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    service = FFmpegAudioService()
    monkeypatch.setattr(service, "probe_duration", lambda path: 600.0)

    calls: list[str] = []

    def fake_normalize(source: Path, destination: Path) -> None:
        calls.append("normalize")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"wav")

    monkeypatch.setattr(service, "normalize", fake_normalize)
    chunks = service.chunk(tmp_path / "in.wav", tmp_path / "out", chunk_seconds=1800)

    assert len(chunks) == 1
    assert chunks[0].start_sec == 0.0
    assert calls == ["normalize"]


def test_chunk_uses_segment_muxer_for_long_audio(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    service = FFmpegAudioService()
    monkeypatch.setattr(service, "probe_duration", lambda path: math.floor(3600.0))
    captured: dict[str, list[str]] = {}

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured["cmd"] = cmd
        # ffmpeg's segment muxer writes chunk_000.wav, chunk_001.wav, ...
        out_dir = Path(cmd[-1]).parent
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "chunk_000.wav").write_bytes(b"wav")
        (out_dir / "chunk_001.wav").write_bytes(b"wav")
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    chunks = service.chunk(tmp_path / "in.wav", tmp_path / "out", chunk_seconds=1800)

    assert [c.start_sec for c in chunks] == [0.0, 1800.0]
    assert captured["cmd"][captured["cmd"].index("-segment_time") + 1] == "1800"
    assert captured["cmd"][captured["cmd"].index("-f") + 1] == "segment"
