import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text

from app.db.models import Meeting, Transcript, User
from app.services.transcription import (
    FakeTranscriber,
    FasterWhisperTranscriber,
    Segment,
    TranscriptResult,
    merge_chunk_transcripts,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLE_DIR = PROJECT_ROOT / ".data" / "sample"


@pytest.fixture(scope="module")
def sample_wav() -> Path:
    sample = SAMPLE_DIR / "meeting_sample.wav"
    if not sample.exists():
        pytest.skip("Sample audio meeting_sample.wav not found")
    return sample


def test_fake_transcriber(sample_wav: Path):
    transcriber = FakeTranscriber()
    result = transcriber.transcribe(sample_wav)

    assert result.language == "en"
    assert len(result.segments) == 4
    assert "weekly sync" in result.full_text
    assert "API documentation" in result.full_text
    assert result.segments[0].start == 0.0
    assert result.segments[0].end > 0


def test_merge_chunk_transcripts_offsets():
    chunk1 = TranscriptResult(
        language="en",
        full_text="Chunk one speech.",
        segments=[
            Segment(id=0, start=1.5, end=4.2, text="Chunk one speech."),
        ],
    )
    chunk2 = TranscriptResult(
        language="en",
        full_text="Chunk two discussion.",
        segments=[
            Segment(id=0, start=2.0, end=7.5, text="Chunk two discussion."),
        ],
    )

    merged = merge_chunk_transcripts([(chunk1, 0.0), (chunk2, 600.0)])
    assert merged.language == "en"
    assert len(merged.segments) == 2

    # First segment: offset 0.0
    assert merged.segments[0].id == 0
    assert merged.segments[0].start == 1.5
    assert merged.segments[0].end == 4.2
    assert merged.segments[0].text == "Chunk one speech."

    # Second segment: offset 600.0
    assert merged.segments[1].id == 1
    assert merged.segments[1].start == 602.0
    assert merged.segments[1].end == 607.5
    assert merged.segments[1].text == "Chunk two discussion."

    assert merged.full_text == "Chunk one speech. Chunk two discussion."


def test_faster_whisper_transcriber_mocked(tmp_path: Path):
    dummy_wav = tmp_path / "test.wav"
    dummy_wav.write_bytes(b"RIFF" + b"\x00" * 40)

    # Mock faster_whisper segments and info
    mock_seg1 = MagicMock()
    mock_seg1.start = 0.5
    mock_seg1.end = 3.2
    mock_seg1.text = "Hello world"

    mock_seg2 = MagicMock()
    mock_seg2.start = 3.5
    mock_seg2.end = 6.0
    mock_seg2.text = "Testing transcription"

    mock_info = MagicMock()
    mock_info.language = "en"

    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([mock_seg1, mock_seg2], mock_info)

    with patch.object(FasterWhisperTranscriber, "get_model", return_value=mock_model):
        transcriber = FasterWhisperTranscriber()
        result = transcriber.transcribe(dummy_wav)

        assert result.language == "en"
        assert len(result.segments) == 2
        assert result.segments[0].text == "Hello world"
        assert result.segments[0].start == 0.5
        assert result.segments[1].text == "Testing transcription"
        assert result.segments[1].start == 3.5
        assert result.full_text == "Hello world Testing transcription"


@pytest.mark.asyncio
async def test_tsvector_full_text_search(db_session):
    # 1. Create user and meeting
    user = User(id=uuid.uuid4(), email="tsv_user@example.com", password_hash="hash")
    meeting = Meeting(id=uuid.uuid4(), user_id=user.id, title="TSV Test")
    db_session.add_all([user, meeting])
    await db_session.commit()

    # 2. Insert transcript
    transcript = Transcript(
        meeting_id=meeting.id,
        full_text="Priya will update the API documentation by Friday. Ravi is fixing the login bug.",
        segments=[],
        model="fake",
    )
    db_session.add(transcript)
    await db_session.commit()

    # 3. Query using PostgreSQL full-text search against search_vector populated by trigger
    query = text(
        "SELECT meeting_id FROM transcripts WHERE search_vector @@ to_tsquery('english', :query)"
    )

    # Search for 'documentation' and 'API'
    res1 = await db_session.execute(query, {"query": "documentation & API"})
    assert res1.scalar_one_or_none() == meeting.id

    # Search for 'login' and 'bug'
    res2 = await db_session.execute(query, {"query": "login & bug"})
    assert res2.scalar_one_or_none() == meeting.id

    # Search for non-existent terms
    res3 = await db_session.execute(query, {"query": "database & migration"})
    assert res3.scalar_one_or_none() is None
