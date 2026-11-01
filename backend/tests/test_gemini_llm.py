import json
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.db.models import Meeting, Transcript
from app.services.analysis import AnalysisService
from app.services.llm import GeminiLLMClient, MeetingAnalysis


def test_gemini_valid_json_completion():
    client = GeminiLLMClient(api_key="test-gemini-key", model="gemini-2.5-flash")

    valid_json = json.dumps(
        {
            "suggested_title": "Gemini Strategy Session",
            "summary": "The team aligned on the Q1 launch priorities and tech specs.",
            "key_points": [
                "Launch set for March",
                "Architecture review scheduled",
                "Budget approved",
            ],
            "decisions": ["Proceed with Gemini integration"],
            "action_items": [
                {
                    "description": "Finalize SDK docs",
                    "owner": "Sarah",
                    "due_date": "2026-03-01",
                    "priority": "high",
                    "source_start_sec": 12.0,
                }
            ],
        }
    )

    mock_resp = MagicMock()
    mock_resp.text = valid_json

    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.return_value = mock_resp

    with patch("google.genai.Client", return_value=mock_genai_client):
        res = client.complete_json("system prompt", "user prompt", MeetingAnalysis)

    assert isinstance(res, MeetingAnalysis)
    assert res.suggested_title == "Gemini Strategy Session"
    assert res.action_items[0].owner == "Sarah"
    assert mock_genai_client.models.generate_content.call_count == 1


def test_gemini_invalid_json_retry_success():
    client = GeminiLLMClient(api_key="test-gemini-key", model="gemini-2.5-flash")

    # First attempt: invalid JSON missing closing brace
    invalid_json = '{"suggested_title": "Sprint", "summary": "Broken'
    resp1 = MagicMock()
    resp1.text = invalid_json

    # Second attempt (retry): valid JSON
    valid_json = json.dumps(
        {
            "suggested_title": "Sprint Planning",
            "summary": "Sprint objectives and delivery schedule finalized.",
            "key_points": ["Velocity stable", "Bug backlog cleared", "Deploy on Friday"],
            "decisions": ["Deploy to staging first"],
            "action_items": [],
        }
    )
    resp2 = MagicMock()
    resp2.text = valid_json

    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.side_effect = [resp1, resp2]

    with patch("google.genai.Client", return_value=mock_genai_client):
        res = client.complete_json("system prompt", "user prompt", MeetingAnalysis)

    assert res.suggested_title == "Sprint Planning"
    # Proves retry once occurred
    assert mock_genai_client.models.generate_content.call_count == 2


def test_gemini_invalid_json_retry_failure():
    client = GeminiLLMClient(api_key="test-gemini-key", model="gemini-2.5-flash")

    bad_resp = MagicMock()
    bad_resp.text = "NOT JSON AT ALL"

    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.return_value = bad_resp

    with patch("google.genai.Client", return_value=mock_genai_client):
        with pytest.raises(ValueError, match="validation failed after retry"):
            client.complete_json("system", "user", MeetingAnalysis)

    # Attempted initial + 1 retry
    assert mock_genai_client.models.generate_content.call_count == 2


def test_gemini_transient_429_backoff_and_retry_success():
    from google.genai.errors import ClientError

    client = GeminiLLMClient(api_key="test-gemini-key", model="gemini-2.5-flash")

    err_429 = ClientError(429, {"error": {"code": 429, "message": "Rate limit exceeded"}})

    valid_json = json.dumps(
        {
            "suggested_title": "Backoff Test",
            "summary": "Successfully recovered after 429 rate limit backoff.",
            "key_points": ["Handled 429 gracefully", "Backoff worked", "Finished task"],
            "decisions": ["Keep rate limiting logic"],
            "action_items": [],
        }
    )
    resp_success = MagicMock()
    resp_success.text = valid_json

    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.side_effect = [err_429, resp_success]

    with (
        patch("google.genai.Client", return_value=mock_genai_client),
        patch("time.sleep") as mock_sleep,
    ):
        res = client.complete_json("system", "user", MeetingAnalysis)

    assert res.suggested_title == "Backoff Test"
    assert mock_genai_client.models.generate_content.call_count == 2
    mock_sleep.assert_called_once_with(1.0)


def test_gemini_transient_503_backoff_and_retry_success():
    from google.genai.errors import ServerError

    client = GeminiLLMClient(api_key="test-gemini-key", model="gemini-2.5-flash")

    err_503 = ServerError(
        503, {"error": {"code": 503, "message": "High demand. Please try again."}}
    )

    valid_json = json.dumps(
        {
            "suggested_title": "503 Recovery",
            "summary": "Recovered from 503 server error.",
            "key_points": ["Demand spike absorbed", "Retry succeeded", "Summary produced"],
            "decisions": ["Keep 5xx retry logic"],
            "action_items": [],
        }
    )
    resp_success = MagicMock()
    resp_success.text = valid_json

    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.side_effect = [err_503, resp_success]

    with (
        patch("google.genai.Client", return_value=mock_genai_client),
        patch("time.sleep") as mock_sleep,
    ):
        res = client.complete_json("system", "user", MeetingAnalysis)

    assert res.suggested_title == "503 Recovery"
    assert mock_genai_client.models.generate_content.call_count == 2
    mock_sleep.assert_called_once_with(1.0)


def test_gemini_invalid_api_key_fails_loudly():
    from google.genai.errors import ClientError

    client = GeminiLLMClient(api_key="bad-key", model="gemini-2.5-flash")

    auth_err = ClientError(401, {"error": {"code": 401, "message": "API_KEY_INVALID"}})

    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.side_effect = auth_err

    with patch("google.genai.Client", return_value=mock_genai_client):
        with pytest.raises(ValueError, match="authentication failed: Invalid or missing API key"):
            client.complete_json("system", "user", MeetingAnalysis)


def test_gemini_quota_exhausted_fails_with_readable_message():
    from google.genai.errors import ClientError

    client = GeminiLLMClient(api_key="test-key", model="gemini-2.5-flash")

    quota_err = ClientError(
        429, {"error": {"code": 429, "message": "RESOURCE_EXHAUSTED: Quota exceeded"}}
    )

    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.side_effect = quota_err

    with patch("google.genai.Client", return_value=mock_genai_client), patch("time.sleep"):
        with pytest.raises(ValueError, match="rate limit or quota exceeded"):
            client.complete_json("system", "user", MeetingAnalysis)


def test_gemini_map_reduce_long_transcript():
    client = GeminiLLMClient(api_key="test-gemini-key", model="gemini-2.5-flash")

    section_json = json.dumps(
        {
            "section_summary": "Window discussion regarding architecture and data flows.",
            "key_points": ["Point A", "Point B"],
            "decisions": ["Decision A"],
            "action_items": [
                {
                    "description": "Setup load balancer",
                    "owner": "Marcus",
                    "due_date": "2026-11-20",
                    "priority": "high",
                    "source_start_sec": 45.0,
                }
            ],
        }
    )

    final_json = json.dumps(
        {
            "suggested_title": "Architecture Deep Dive",
            "summary": "Overall architecture review covering data ingestion and load balancing.",
            "key_points": [
                "Ingestion throughput acceptable",
                "Load balancer rollout",
                "Monitoring alerts",
            ],
            "decisions": ["Deploy load balancer"],
            "action_items": [
                {
                    "description": "Setup load balancer",
                    "owner": "Marcus",
                    "due_date": "2026-11-20",
                    "priority": "high",
                    "source_start_sec": 45.0,
                }
            ],
        }
    )

    mock_section_resp = MagicMock(text=section_json)
    mock_final_resp = MagicMock(text=final_json)

    # 4 windows (0-600s, 600-1200s, 1200-1800s, 1800-2400s) -> 4 map calls + 1 reduce call
    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.side_effect = [
        mock_section_resp,
        mock_section_resp,
        mock_section_resp,
        mock_section_resp,
        mock_final_resp,
    ]

    long_text = (
        "Detailed discussion about backend infrastructure. " * 2000
    )  # 100,000 chars > 20,000 tokens
    segments = [
        {"id": i, "start": float(i * 100), "end": float((i + 1) * 100), "text": f"Segment {i}"}
        for i in range(25)
    ]

    transcript = Transcript(
        meeting_id=uuid.uuid4(),
        full_text=long_text,
        segments=segments,
        model="faster-whisper",
    )
    meeting = Meeting(id=transcript.meeting_id, user_id=uuid.uuid4(), title="Untitled")

    service = AnalysisService(client)

    with patch("google.genai.Client", return_value=mock_genai_client):
        analysis = service.analyze_transcript(transcript, meeting)

    assert analysis.suggested_title == "Architecture Deep Dive"
    assert len(analysis.action_items) == 1
    assert analysis.action_items[0].owner == "Marcus"
