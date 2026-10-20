"""Transcription unit tests (Phase 4): offset merging and transcriber selection.

No model is loaded and no network call is made; `FasterWhisperTranscriber` is only checked
for its lazy behavior and name, and merging is pure (D7).
"""

import pytest

from app.services.transcription import (
    FasterWhisperTranscriber,
    Segment,
    TranscriptResult,
    full_text_from_segments,
    merge_segments,
)


def _result(*segments: tuple[float, float, str], language: str = "en") -> TranscriptResult:
    return TranscriptResult(
        language=language,
        duration=segments[-1][1] if segments else 0.0,
        segments=[Segment(start=s, end=e, text=t) for s, e, t in segments],
    )


def test_merge_single_chunk_keeps_timestamps() -> None:
    merged = merge_segments([_result((0.0, 2.0, "hello"), (2.0, 4.0, "world"))], [0.0])
    assert [(s.start, s.end, s.text) for s in merged] == [
        (0.0, 2.0, "hello"),
        (2.0, 4.0, "world"),
    ]


def test_merge_applies_chunk_offsets() -> None:
    """The second chunk's segments must shift by the chunk's start offset (D32)."""
    first = _result((0.0, 5.0, "intro"))
    second = _result((0.0, 5.0, "middle"))
    third = _result((0.0, 5.0, "end"))

    merged = merge_segments([first, second, third], [0.0, 1800.0, 3600.0])
    assert [s.start for s in merged] == [0.0, 1800.0, 3600.0]
    assert [s.text for s in merged] == ["intro", "middle", "end"]


def test_merge_orders_by_start_time() -> None:
    merged = merge_segments(
        [_result((5.0, 6.0, "late")), _result((0.0, 1.0, "early"))],
        [0.0, 0.0],
    )
    assert [s.text for s in merged] == ["early", "late"]


def test_merge_skips_blank_segments() -> None:
    merged = merge_segments([_result((0.0, 1.0, "  "), (1.0, 2.0, "kept"))], [0.0])
    assert [s.text for s in merged] == ["kept"]


def test_merge_strips_whitespace() -> None:
    merged = merge_segments([_result((0.0, 1.0, "  padded  "))], [0.0])
    assert merged[0].text == "padded"


def test_merge_rejects_mismatched_lengths() -> None:
    with pytest.raises(ValueError, match="same length"):
        merge_segments([_result((0.0, 1.0, "a"))], [0.0, 1800.0])


def test_full_text_joins_segments() -> None:
    segments = [Segment(0.0, 1.0, "hello"), Segment(1.0, 2.0, "world")]
    assert full_text_from_segments(segments) == "hello world"


def test_faster_whisper_is_lazy_and_names_its_model() -> None:
    transcriber = FasterWhisperTranscriber(model_size="small", device="cpu", compute_type="int8")
    # No model loaded until transcribe() is called.
    assert transcriber._model is None  # noqa: SLF001 - asserting lazy init
    assert transcriber.model_name == "faster-whisper-small"


def test_transcriber_selection_defaults_to_faster_whisper(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import transcription

    settings = type(
        "S",
        (),
        {
            "transcriber": "faster_whisper",
            "whisper_model": "small",
            "whisper_device": "cpu",
            "whisper_compute_type": "int8",
            "transcribe_language": "",
            "openai_api_key": "",
            "openai_whisper_model": "whisper-1",
        },
    )()
    monkeypatch.setattr(transcription, "get_settings", lambda: settings)
    assert isinstance(transcription.get_transcriber(), FasterWhisperTranscriber)
