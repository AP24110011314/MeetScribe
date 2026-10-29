import uuid
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.db.models import ActionItem, Meeting, Summary, Transcript, User
from app.services.analysis import AnalysisService
from app.services.llm import (
    ActionItemAnalysis,
    AnthropicClient,
    FakeLLMClient,
    MeetingAnalysis,
)


@pytest.fixture
def sample_transcript() -> Transcript:
    return Transcript(
        meeting_id=uuid.uuid4(),
        full_text=(
            "Welcome to the weekly sync. We decided to ship the beta on November fifteenth. "
            "Action item: Priya will update the API documentation by Friday. "
            "Action item: Ravi should fix the login bug as soon as possible. "
            "That is everything for today. Thanks everyone."
        ),
        segments=[
            {
                "id": 0,
                "start": 0.0,
                "end": 5.56,
                "text": "Welcome to the weekly sync. We decided to ship the beta on November fifteenth.",
            },
            {
                "id": 1,
                "start": 5.56,
                "end": 10.12,
                "text": "Action item: Priya will update the API documentation by Friday.",
            },
            {
                "id": 2,
                "start": 10.12,
                "end": 14.24,
                "text": "Action item: Ravi should fix the login bug as soon as possible.",
            },
            {
                "id": 3,
                "start": 14.24,
                "end": 17.0,
                "text": "That is everything for today. Thanks everyone.",
            },
        ],
        model="faster-whisper",
    )


def test_single_pass_analysis(sample_transcript: Transcript):
    meeting = Meeting(id=sample_transcript.meeting_id, user_id=uuid.uuid4(), title="Untitled")
    service = AnalysisService(FakeLLMClient())

    analysis = service.analyze_transcript(sample_transcript, meeting)

    assert isinstance(analysis, MeetingAnalysis)
    # F06: Summary max ~250 words
    word_count = len(analysis.summary.split())
    assert word_count <= 250
    assert len(analysis.summary) > 20

    # F06: 3 to 10 key points
    assert 3 <= len(analysis.key_points) <= 10

    # F06: Decisions present
    assert len(analysis.decisions) >= 1
    assert any("November 15" in d for d in analysis.decisions)

    # F07: Action items extraction
    assert len(analysis.action_items) >= 2
    priya_item = next((item for item in analysis.action_items if item.owner == "Priya"), None)
    assert priya_item is not None
    assert "documentation" in priya_item.description.lower()
    assert priya_item.priority in ("low", "medium", "high")
    assert priya_item.source_start_sec is not None

    ravi_item = next((item for item in analysis.action_items if item.owner == "Ravi"), None)
    assert ravi_item is not None
    assert "login" in ravi_item.description.lower()


def test_action_item_unassigned_owner_is_null():
    transcript = Transcript(
        meeting_id=uuid.uuid4(),
        full_text="Someone should investigate memory usage spike tomorrow.",
        segments=[
            {
                "id": 0,
                "start": 0.0,
                "end": 5.0,
                "text": "Someone should investigate memory usage spike tomorrow.",
            }
        ],
        model="fake",
    )
    meeting = Meeting(id=transcript.meeting_id, user_id=uuid.uuid4(), title="Untitled")
    service = AnalysisService(FakeLLMClient())

    analysis = service.analyze_transcript(transcript, meeting)

    unassigned_item = next(
        (item for item in analysis.action_items if "memory" in item.description.lower()), None
    )
    assert unassigned_item is not None
    # Rule: Never invent names, owner must be null
    assert unassigned_item.owner is None


def test_title_set_only_if_not_edited(sync_db):
    user = User(id=uuid.uuid4(), email="title_test@example.com", password_hash="hash")
    sync_db.add(user)

    # Meeting 1: title_edited is False -> should update title
    m1 = Meeting(id=uuid.uuid4(), user_id=user.id, title="Original Title", title_edited=False)
    # Meeting 2: title_edited is True -> should preserve title
    m2 = Meeting(id=uuid.uuid4(), user_id=user.id, title="Custom Kept Title", title_edited=True)
    sync_db.add_all([m1, m2])
    sync_db.commit()

    analysis = MeetingAnalysis(
        suggested_title="Suggested New Title",
        summary="A brief summary.",
        key_points=["Point 1", "Point 2", "Point 3"],
        decisions=["Decision 1"],
        action_items=[],
    )

    service = AnalysisService(FakeLLMClient())
    service.save_analysis(sync_db, m1, analysis)
    service.save_analysis(sync_db, m2, analysis)

    assert m1.title == "Suggested New Title"
    assert m2.title == "Custom Kept Title"


def test_map_reduce_long_transcript():
    # Construct synthetic long transcript (>20,000 tokens / 80k chars)
    chunk_text = (
        " Discussion about systems architecture, database scalability, and performance testing. "
    )
    long_text = chunk_text * 1200  # ~100k characters

    # Create segments across 40 minutes (2400 seconds)
    segments = []
    for i in range(24):
        segments.append(
            {
                "id": i,
                "start": float(i * 100),
                "end": float((i + 1) * 100),
                "text": f"Section {i}: Discussion about milestones and action items.",
            }
        )

    long_transcript = Transcript(
        meeting_id=uuid.uuid4(),
        full_text=long_text,
        segments=segments,
        model="faster-whisper",
    )
    meeting = Meeting(id=long_transcript.meeting_id, user_id=uuid.uuid4(), title="Long Meeting")
    service = AnalysisService(FakeLLMClient())

    analysis = service.analyze_transcript(long_transcript, meeting)
    assert isinstance(analysis, MeetingAnalysis)
    assert analysis.suggested_title is not None
    assert len(analysis.key_points) >= 3


def test_validation_retry_success():
    client = AnthropicClient(api_key="test-key", model="claude-sonnet-5-5")

    # Mock response 1: invalid JSON (missing closing brace)
    resp1 = MagicMock()
    resp1.content = [MagicMock(text='{"suggested_title": "Sprint Sync", "summary": "Unfinished')]

    # Mock response 2: valid JSON
    valid_json = """
    {
      "suggested_title": "Sprint Sync",
      "summary": "Completed sprint sync summary.",
      "key_points": ["Item 1", "Item 2", "Item 3"],
      "decisions": ["Approved plan"],
      "action_items": []
    }
    """
    resp2 = MagicMock()
    resp2.content = [MagicMock(text=valid_json)]

    mock_anthropic = MagicMock()
    mock_anthropic.messages.create.side_effect = [resp1, resp2]

    with patch("anthropic.Anthropic", return_value=mock_anthropic):
        res = client.complete_json("system", "user", MeetingAnalysis)
        assert res.suggested_title == "Sprint Sync"
        assert len(mock_anthropic.messages.create.call_args_list) == 2


def test_validation_retry_failure():
    client = AnthropicClient(api_key="test-key", model="claude-sonnet-5-5")

    resp_invalid = MagicMock()
    resp_invalid.content = [MagicMock(text="Not JSON at all")]

    mock_anthropic = MagicMock()
    mock_anthropic.messages.create.return_value = resp_invalid

    with patch("anthropic.Anthropic", return_value=mock_anthropic):
        with pytest.raises(ValueError, match="validation failed after retry"):
            client.complete_json("system", "user", MeetingAnalysis)


def test_save_analysis_idempotency(sync_db, sample_transcript: Transcript):
    user = User(id=uuid.uuid4(), email="idempotent_analysis@example.com", password_hash="hash")
    meeting = Meeting(id=sample_transcript.meeting_id, user_id=user.id, title="Sync")
    sync_db.add_all([user, meeting, sample_transcript])
    sync_db.commit()

    service = AnalysisService(FakeLLMClient())
    analysis = service.analyze_transcript(sample_transcript, meeting)

    # First save
    service.save_analysis(sync_db, meeting, analysis)

    summary1 = sync_db.execute(select(Summary).where(Summary.meeting_id == meeting.id)).scalar_one()
    assert summary1.summary == analysis.summary
    assert len(summary1.key_points) == len(analysis.key_points)

    items1 = (
        sync_db.execute(select(ActionItem).where(ActionItem.meeting_id == meeting.id))
        .scalars()
        .all()
    )
    count1 = len(items1)
    assert count1 >= 2

    # Second save with updated analysis should replace AI action items cleanly without duplicates
    analysis.action_items.append(
        ActionItemAnalysis(
            description="Newly appended task",
            owner="Alice",
            priority="low",
        )
    )
    service.save_analysis(sync_db, meeting, analysis)

    items2 = (
        sync_db.execute(select(ActionItem).where(ActionItem.meeting_id == meeting.id))
        .scalars()
        .all()
    )
    assert len(items2) == count1 + 1
