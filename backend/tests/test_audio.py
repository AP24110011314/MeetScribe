from pathlib import Path

import pytest

from app.services.audio import AudioService

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLE_DIR = PROJECT_ROOT / ".data" / "sample"


@pytest.fixture(scope="module")
def sample_audio() -> Path:
    sample = SAMPLE_DIR / "meeting_sample.wav"
    if not sample.exists():
        pytest.skip("Sample audio meeting_sample.wav not generated yet")
    return sample


def test_probe_audio_valid(sample_audio: Path):
    info = AudioService.probe_audio(sample_audio)
    assert "duration_sec" in info
    assert info["duration_sec"] > 0
    assert info["sample_rate"] == 16000
    assert info["channels"] == 1


def test_probe_audio_empty(tmp_path: Path):
    empty_file = tmp_path / "empty.wav"
    empty_file.touch()

    with pytest.raises(ValueError, match="is empty"):
        AudioService.probe_audio(empty_file)


def test_probe_audio_corrupt(tmp_path: Path):
    corrupt_file = tmp_path / "corrupt.mp3"
    corrupt_file.write_text("not audio data")

    with pytest.raises(ValueError, match="Failed to probe audio"):
        AudioService.probe_audio(corrupt_file)


def test_probe_audio_nonexistent(tmp_path: Path):
    missing_file = tmp_path / "does_not_exist.wav"
    with pytest.raises(FileNotFoundError):
        AudioService.probe_audio(missing_file)


def test_normalize_yields_16khz_mono(sample_audio: Path, tmp_path: Path):
    out_wav = tmp_path / "normalized.wav"
    AudioService.normalize(sample_audio, out_wav)

    assert out_wav.is_file()
    info = AudioService.probe_audio(out_wav)
    assert info["sample_rate"] == 16000
    assert info["channels"] == 1
    assert info["duration_sec"] > 0


def test_chunk_audio_short_file(sample_audio: Path, tmp_path: Path):
    chunks = AudioService.chunk_audio(sample_audio, tmp_path / "chunks")
    assert len(chunks) == 1
    assert chunks[0][0] == sample_audio
    assert chunks[0][1] == 0.0


def test_chunk_audio_35min_file_yields_4_chunks(tmp_path: Path):
    long_audio = SAMPLE_DIR / "meeting_35min.mp3"
    if not long_audio.exists():
        pytest.skip("Long sample meeting_35min.mp3 not found")

    # Normalize long audio first to get a wav
    normalized_long = tmp_path / "normalized_long.wav"
    AudioService.normalize(long_audio, normalized_long)

    chunks = AudioService.chunk_audio(normalized_long, tmp_path / "chunks", chunk_duration_sec=600)
    # 2100 seconds (35 min) split into 600s chunks should yield exactly 4 chunks:
    # Chunk 0: 0.0 -> 600.0
    # Chunk 1: 600.0 -> 1200.0
    # Chunk 2: 1200.0 -> 1800.0
    # Chunk 3: 1800.0 -> 2100.0
    assert len(chunks) == 4
    assert chunks[0][1] == 0.0
    assert chunks[1][1] == 600.0
    assert chunks[2][1] == 1200.0
    assert chunks[3][1] == 1800.0
    for chunk_path, _ in chunks:
        assert chunk_path.is_file()
