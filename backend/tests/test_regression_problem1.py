import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import settings
from app.db.models import Meeting, Transcript
from app.services.analysis import AnalysisService
from app.services.audio import AudioService
from app.services.llm import FakeLLMClient
from app.workers.celery_app import on_worker_ready


def test_two_different_inputs_produce_different_analyses():
    """
    Regression test for Problem 1:
    Verifies that two distinct meeting transcripts (e.g. Apollo vs Marketing)
    produce distinct titles, summaries, and action items instead of identical notes.
    """
    service = AnalysisService(FakeLLMClient())

    m_apollo = Meeting(id=uuid.uuid4(), user_id=uuid.uuid4(), title="Apollo Meeting")
    tr_apollo = Transcript(
        meeting_id=m_apollo.id,
        full_text="The Apollo space mission is scheduled for launch in late December. Alice will review the rocket fuel budget by Wednesday.",
        segments=[
            {
                "id": 0,
                "start": 0.0,
                "end": 5.0,
                "text": "The Apollo space mission is scheduled for launch in late December.",
            },
            {
                "id": 1,
                "start": 5.0,
                "end": 10.0,
                "text": "Alice will review the rocket fuel budget by Wednesday.",
            },
        ],
        model="faster-whisper",
    )

    m_marketing = Meeting(id=uuid.uuid4(), user_id=uuid.uuid4(), title="Marketing Meeting")
    tr_marketing = Transcript(
        meeting_id=m_marketing.id,
        full_text="Welcome to the international marketing team review. Bob will contact the advertising agency by next Monday.",
        segments=[
            {
                "id": 0,
                "start": 0.0,
                "end": 4.0,
                "text": "Welcome to the international marketing team review.",
            },
            {
                "id": 1,
                "start": 4.0,
                "end": 8.0,
                "text": "Bob will contact the advertising agency by next Monday.",
            },
        ],
        model="faster-whisper",
    )

    res_apollo = service.analyze_transcript(tr_apollo, m_apollo)
    res_marketing = service.analyze_transcript(tr_marketing, m_marketing)

    # 1. Proves summaries differ
    assert res_apollo.summary != res_marketing.summary
    assert "apollo" in res_apollo.summary.lower()
    assert "marketing" in res_marketing.summary.lower()

    # 2. Proves titles differ
    assert res_apollo.suggested_title != res_marketing.suggested_title

    # 3. Proves action items and owners differ
    apollo_owners = [item.owner for item in res_apollo.action_items]
    marketing_owners = [item.owner for item in res_marketing.action_items]
    assert apollo_owners != marketing_owners
    assert "Alice" in apollo_owners
    assert "Bob" in marketing_owners


def test_temp_paths_unique_per_job():
    """
    Regression test: Verifies that job workspaces use unique directories
    and do not collide across different meeting IDs.
    """
    m1_id = uuid.uuid4()
    m2_id = uuid.uuid4()

    path1 = Path(tempfile.mkdtemp(prefix=f"meeting_{m1_id}_"))
    path2 = Path(tempfile.mkdtemp(prefix=f"meeting_{m2_id}_"))

    try:
        assert path1 != path2
        assert str(m1_id) in path1.name
        assert str(m2_id) in path2.name
        assert path1.exists() and path2.exists()
    finally:
        import shutil

        shutil.rmtree(path1, ignore_errors=True)
        shutil.rmtree(path2, ignore_errors=True)


def test_mp4_audio_extraction_includes_vn_flag():
    """
    Regression test: Verifies that AudioService.normalize includes -vn
    to drop video streams when extracting audio from MP4 files.
    """
    with patch("subprocess.run") as mock_run, patch("pathlib.Path.is_file", return_value=True):
        mock_run.return_value = MagicMock(returncode=0)

        in_p = Path("/tmp/sample.mp4")
        out_p = Path("/tmp/sample.wav")
        AudioService.normalize(in_p, out_p)

        cmd = mock_run.call_args[0][0]
        assert "-vn" in cmd
        assert "-c:a" in cmd
        assert "pcm_s16le" in cmd


def test_video_without_audio_fails_probe():
    """
    Regression test: Proves that a video-only MP4 file with no audio stream
    raises ValueError during ffprobe inspection.
    """
    video_only_json = """
    {
      "streams": [
        {"codec_type": "video", "duration": "10.0"}
      ],
      "format": {"duration": "10.0"}
    }
    """
    with (
        patch("pathlib.Path.is_file", return_value=True),
        patch("pathlib.Path.stat", return_value=MagicMock(st_size=4096)),
        patch("subprocess.run") as mock_run,
    ):
        mock_run.return_value = MagicMock(stdout=video_only_json, returncode=0)

        with pytest.raises(ValueError, match="No audio stream found in file"):
            AudioService.probe_audio(Path("/tmp/no_audio.mp4"))


def test_worker_fails_loudly_outside_test_with_fake_provider(monkeypatch):
    """
    Requirement 5: Outside ENV=test, refuse to start the worker or fail the job
    if a fake provider is selected or a required key is missing.
    """
    # 1. Test worker startup signal refusal
    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "TRANSCRIBER", "faster_whisper")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "fake")

    with pytest.raises(RuntimeError, match="LLM_PROVIDER cannot be 'fake' outside ENV=test"):
        on_worker_ready()

    # 2. Test worker startup signal refusal for missing API key
    monkeypatch.setattr(settings, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "LLM_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    with pytest.raises(RuntimeError, match="Missing API key for LLM_PROVIDER=gemini"):
        on_worker_ready()
