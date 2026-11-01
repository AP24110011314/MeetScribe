import json
import logging
import re
from typing import Any, Iterator, List, Optional, Protocol, Type, TypeVar

from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class ActionItemAnalysis(BaseModel):
    description: str = Field(..., description="Actionable task description")
    owner: Optional[str] = Field(None, description="Explicit owner name or null")
    due_date: Optional[str] = Field(None, description="ISO format date YYYY-MM-DD or null")
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    source_start_sec: Optional[float] = Field(None, description="Timestamp offset in seconds")


class MeetingAnalysis(BaseModel):
    suggested_title: str = Field(..., description="Suggested concise title for meeting")
    summary: str = Field(..., description="Executive summary, maximum ~250 words")
    key_points: List[str] = Field(..., description="3 to 10 major discussion points")
    decisions: List[str] = Field(default_factory=list, description="Agreements reached")
    action_items: List[ActionItemAnalysis] = Field(default_factory=list)


class SectionAnalysis(BaseModel):
    section_summary: str = Field(..., description="Summary of this meeting window")
    key_points: List[str] = Field(default_factory=list)
    decisions: List[str] = Field(default_factory=list)
    action_items: List[ActionItemAnalysis] = Field(default_factory=list)


class LLMClient(Protocol):
    def complete_json(
        self,
        system: str,
        user: str,
        schema: Type[T],
    ) -> T: ...

    def complete_text(
        self,
        system: str,
        user: str,
    ) -> str: ...

    def stream_text(
        self,
        system: str,
        user: str,
    ) -> Iterator[str]: ...


def extract_json_payload(raw_text: str) -> str:
    """
    Extracts raw JSON text even if wrapped in markdown code fences.
    """
    cleaned = raw_text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if match:
        return match.group(1).strip()
    return cleaned


class AnthropicClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or settings.LLM_API_KEY
        self.model = model or settings.LLM_MODEL

    def complete_json(
        self,
        system: str,
        user: str,
        schema: Type[T],
    ) -> T:
        try:
            import anthropic
        except ImportError as e:
            raise RuntimeError("anthropic package is required for AnthropicClient") from e

        client = anthropic.Anthropic(api_key=self.api_key)

        schema_json = json.dumps(schema.model_json_schema(), indent=2)
        full_system = (
            f"{system}\n\nYou MUST respond with valid JSON matching this schema:\n{schema_json}"
        )

        logger.info("Calling Anthropic Claude model %s for JSON completion", self.model)
        messages: List[dict[str, str]] = [{"role": "user", "content": user}]

        response = client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=full_system,
            messages=messages,  # type: ignore[arg-type]
        )

        content_block = response.content[0]
        raw_text = getattr(content_block, "text", "")

        # 1. Attempt initial parse and Pydantic validation
        validation_err_msg = ""
        try:
            json_str = extract_json_payload(raw_text)
            data = json.loads(json_str)
            return schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as first_err:
            validation_err_msg = str(first_err)
            logger.warning(
                "Initial LLM response failed validation (%s). Retrying once with error feedback...",
                first_err,
            )

        # 2. Retry once with validation feedback per architecture guidelines
        retry_prompt = (
            f"Your previous output failed validation with the following error:\n"
            f"{validation_err_msg}\n\n"
            f"Previous Output:\n"
            f"{raw_text}\n\n"
            f"Please fix the error and output only valid JSON conforming strictly to the schema."
        )

        messages.append({"role": "assistant", "content": raw_text})
        messages.append({"role": "user", "content": retry_prompt})

        retry_response = client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=full_system,
            messages=messages,  # type: ignore[arg-type]
        )

        retry_raw = getattr(retry_response.content[0], "text", "")
        try:
            json_str2 = extract_json_payload(retry_raw)
            data2 = json.loads(json_str2)
            return schema.model_validate(data2)
        except (json.JSONDecodeError, ValidationError) as second_err:
            logger.error("LLM JSON completion failed on retry: %s", second_err)
            raise ValueError(
                f"LLM JSON schema validation failed after retry: {second_err}"
            ) from second_err

    def complete_text(self, system: str, user: str) -> str:
        try:
            import anthropic
        except ImportError as e:
            raise RuntimeError("anthropic package is required for AnthropicClient") from e

        client = anthropic.Anthropic(api_key=self.api_key)
        response = client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return getattr(response.content[0], "text", "")

    def stream_text(self, system: str, user: str) -> Iterator[str]:
        try:
            import anthropic
        except ImportError as e:
            raise RuntimeError("anthropic package is required for AnthropicClient") from e

        client = anthropic.Anthropic(api_key=self.api_key)
        with client.messages.stream(
            model=self.model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            for text in stream.text_stream:
                yield text


class GeminiLLMClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or settings.effective_llm_api_key
        self.model = model or settings.LLM_MODEL
        if not self.api_key:
            raise ValueError(
                "Gemini API key is required. Set LLM_API_KEY (or GEMINI_API_KEY) in .env"
            )

    def _call_gemini_with_retry(
        self,
        client: Any,
        prompt: str,
        system: str,
        schema: Type[T],
    ) -> str:
        import time

        from google.genai import errors, types

        max_attempts = 4
        delay = 1.0

        for attempt in range(1, max_attempts + 1):
            try:
                config = types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    response_schema=schema,
                )
                logger.info(
                    "Calling Gemini model %s (attempt %d/%d)",
                    self.model,
                    attempt,
                    max_attempts,
                )
                response = client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=config,
                )
                text = response.text or ""
                if not text.strip():
                    raise ValueError("Gemini returned empty response text")
                return text

            except errors.APIError as api_err:
                status_code = getattr(api_err, "code", None) or getattr(
                    api_err, "status_code", None
                )
                err_message = str(api_err)

                # If gemini-2.5-flash is 404 (deprecated by Google for new users) -> fallback
                if (
                    status_code == 404
                    and "gemini-2.5-flash" in self.model
                    and "no longer available" in err_message
                ):
                    logger.warning(
                        "Gemini model %s is no longer available to new users. Falling back to gemini-3.5-flash",
                        self.model,
                    )
                    self.model = "gemini-3.5-flash"
                    continue

                # Non-transient errors: Invalid key, authentication, quota exceeded
                if (
                    status_code in (400, 401, 403)
                    or "API_KEY_INVALID" in err_message
                    or "UNAUTHENTICATED" in err_message
                ):
                    raise ValueError(
                        "Gemini API authentication failed: Invalid or missing API key."
                    ) from api_err

                if "RESOURCE_EXHAUSTED" in err_message or "quota" in err_message.lower():
                    if attempt == max_attempts:
                        raise ValueError(
                            "Gemini API rate limit or quota exceeded. Please try again later."
                        ) from api_err

                # Transient errors: 429 rate limit or 5xx server errors
                if status_code in (429, 500, 502, 503, 504) or (status_code and status_code >= 500):
                    if attempt < max_attempts:
                        logger.warning(
                            "Transient Gemini API error (status=%s, attempt=%d/%d). Retrying in %.1fs... Error: %s",
                            status_code,
                            attempt,
                            max_attempts,
                            delay,
                            api_err,
                        )
                        time.sleep(delay)
                        delay *= 2
                        continue
                    raise ValueError(
                        f"Gemini API unavailable after {max_attempts} retries: {err_message}"
                    ) from api_err

                raise ValueError(f"Gemini API error: {err_message}") from api_err

            except Exception as ex:
                if attempt < max_attempts and isinstance(
                    ex, (ConnectionError, TimeoutError, OSError)
                ):
                    logger.warning(
                        "Network error calling Gemini: %s. Retrying in %.1fs...", ex, delay
                    )
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise

        raise RuntimeError(f"Gemini API call failed after {max_attempts} attempts")

    def complete_json(
        self,
        system: str,
        user: str,
        schema: Type[T],
    ) -> T:
        try:
            from google import genai
        except ImportError as e:
            raise RuntimeError("google-genai package is required for GeminiLLMClient") from e

        client = genai.Client(api_key=self.api_key)

        raw_text = self._call_gemini_with_retry(client, user, system, schema)

        # 1. Attempt initial parse and Pydantic validation
        validation_err_msg = ""
        try:
            json_str = extract_json_payload(raw_text)
            data = json.loads(json_str)
            return schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as first_err:
            validation_err_msg = str(first_err)
            logger.warning(
                "Initial Gemini response failed validation (%s). Retrying once with error feedback...",
                first_err,
            )

        # 2. Retry once with validation feedback per architecture guidelines
        retry_prompt = (
            f"{user}\n\n"
            f"Your previous output failed validation with the following error:\n"
            f"{validation_err_msg}\n\n"
            f"Previous Output:\n"
            f"{raw_text}\n\n"
            f"Please fix the error and output only valid JSON conforming strictly to the schema."
        )

        retry_raw = self._call_gemini_with_retry(client, retry_prompt, system, schema)
        try:
            json_str2 = extract_json_payload(retry_raw)
            data2 = json.loads(json_str2)
            return schema.model_validate(data2)
        except (json.JSONDecodeError, ValidationError) as second_err:
            logger.error("Gemini JSON completion failed on retry: %s", second_err)
            raise ValueError(
                f"LLM JSON schema validation failed after retry: {second_err}"
            ) from second_err

    def complete_text(self, system: str, user: str) -> str:
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            raise RuntimeError("google-genai package is required for GeminiLLMClient") from e

        client = genai.Client(api_key=self.api_key)
        config = types.GenerateContentConfig(
            system_instruction=system,
        )
        response = client.models.generate_content(
            model=self.model,
            contents=user,
            config=config,
        )
        return response.text or ""

    def stream_text(self, system: str, user: str) -> Iterator[str]:
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            raise RuntimeError("google-genai package is required for GeminiLLMClient") from e

        client = genai.Client(api_key=self.api_key)
        config = types.GenerateContentConfig(
            system_instruction=system,
        )
        response_stream = client.models.generate_content_stream(
            model=self.model,
            contents=user,
            config=config,
        )
        for chunk in response_stream:
            text = chunk.text or ""
            if text:
                yield text


class FakeLLMClient:
    """
    Deterministic mock client for unit testing and offline pipeline execution.
    Inspects transcript text and returns realistic meeting notes conforming to MeetingAnalysis.
    """

    def __init__(self, should_fail_validation: bool = False) -> None:
        self.should_fail_validation = should_fail_validation

    def complete_json(
        self,
        system: str,
        user: str,
        schema: Type[T],
    ) -> T:
        if self.should_fail_validation or "SIMULATE_VALIDATION_ERROR" in user:
            raise ValueError("Simulated validation error after retry")

        schema_name = getattr(schema, "__name__", str(schema))
        if "Chapter" in schema_name:
            return schema.model_validate(
                {
                    "chapters": [
                        {
                            "title": "Introduction & Agenda",
                            "start_sec": 0.0,
                            "end_sec": 60.0,
                            "summary": "Kickoff and overview.",
                        },
                        {
                            "title": "Beta Launch Discussion",
                            "start_sec": 60.0,
                            "end_sec": 180.0,
                            "summary": "Review of release milestones.",
                        },
                    ]
                }
            )

        if "Email" in schema_name:
            return schema.model_validate(
                {
                    "subject": "Follow-up: Weekly Team Sync",
                    "recipient_suggestion": "Team Members",
                    "body": "Hi everyone,\n\nThanks for meeting today. We confirmed our beta release date for November 15th.\n\nBest,\nTeam Lead",
                }
            )

        if "Translated" in schema_name:
            return schema.model_validate(
                {
                    "language": "Spanish",
                    "title": "Sincronización Semanal del Equipo",
                    "summary": "El equipo se reunió para coordinar hitos de la versión beta.",
                    "key_points": ["Lanzamiento beta confirmado para el 15 de noviembre."],
                    "decisions": ["Enviar la versión beta el 15 de noviembre."],
                    "action_items": [
                        {
                            "description": "Actualizar la documentación de la API",
                            "owner": "Priya",
                            "due_date": "2026-11-06",
                            "priority": "high",
                            "source_start_sec": 6.56,
                        }
                    ],
                }
            )

        if "Insight" in schema_name:
            return schema.model_validate(
                {
                    "sentiment": "positive",
                    "pace_wpm": 145,
                    "top_keywords": ["beta release", "API documentation", "deadline", "PostgreSQL"],
                    "unanswered_questions": ["What is the fallback plan if testing is delayed?"],
                    "speaker_distribution": [
                        {"speaker": "Speaker 1", "talk_time_pct": 60.0},
                        {"speaker": "Speaker 2", "talk_time_pct": 40.0},
                    ],
                }
            )

        # Map phase handling
        if schema == SectionAnalysis:
            return schema.model_validate(
                {
                    "section_summary": "Section discussion covering progress and deadlines.",
                    "key_points": [
                        "Beta release scheduled for November 15th.",
                        "API documentation requires updating.",
                    ],
                    "decisions": ["Ship beta on November 15th."],
                    "action_items": [
                        {
                            "description": "Update the API documentation",
                            "owner": "Priya",
                            "due_date": "2026-11-06",
                            "priority": "high",
                            "source_start_sec": 6.56,
                        }
                    ],
                }
            )

        # Dynamic responses based on keywords in transcript
        user_lower = user.lower()
        if "apollo" in user_lower:
            return schema.model_validate(
                {
                    "suggested_title": "Project Apollo Mission Sync",
                    "summary": "The team met to review Project Apollo mission parameters and rocket fuel budget deadlines.",
                    "key_points": [
                        "Apollo mission launch scheduled for late December.",
                        "Rocket fuel budget review required by Wednesday.",
                    ],
                    "decisions": [
                        "Alice will review the rocket fuel budget by Wednesday.",
                    ],
                    "action_items": [
                        {
                            "description": "Review the rocket fuel budget",
                            "owner": "Alice",
                            "due_date": "2026-12-02",
                            "priority": "high",
                            "source_start_sec": 5.0,
                        }
                    ],
                }
            )
        elif "marketing" in user_lower:
            return schema.model_validate(
                {
                    "suggested_title": "International Marketing Review",
                    "summary": "The international marketing team reviewed campaign rollout timelines and agency coordination.",
                    "key_points": [
                        "International marketing rollout kickoff.",
                        "Advertising agency contact deadline next Monday.",
                    ],
                    "decisions": [
                        "Bob to contact advertising agency.",
                    ],
                    "action_items": [
                        {
                            "description": "Contact the advertising agency",
                            "owner": "Bob",
                            "due_date": "2026-11-09",
                            "priority": "medium",
                            "source_start_sec": 4.0,
                        }
                    ],
                }
            )

        # Single-pass or Reduce phase handling (MeetingAnalysis)
        # Check transcript content for dynamic extraction
        action_items = [
            ActionItemAnalysis(
                description="Update the API documentation",
                owner="Priya",
                due_date="2026-11-06",
                priority="high",
                source_start_sec=6.56,
            ),
            ActionItemAnalysis(
                description="Fix the login bug as soon as possible",
                owner="Ravi",
                due_date=None,
                priority="high",
                source_start_sec=11.12,
            ),
        ]

        if "unassigned" in user.lower() or "someone should" in user.lower():
            action_items.append(
                ActionItemAnalysis(
                    description="Investigate memory usage spike",
                    owner=None,
                    due_date=None,
                    priority="medium",
                    source_start_sec=20.0,
                )
            )

        return schema.model_validate(
            {
                "suggested_title": "Weekly Team Sync",
                "summary": (
                    "The team held their weekly sync meeting to coordinate key milestones for the upcoming beta release. "
                    "Participants agreed on a firm shipment date of November 15th. "
                    "Responsibilities were delegated to ensure developer documentation is brought up to date and "
                    "blocking authentication bugs are resolved promptly."
                ),
                "key_points": [
                    "Beta release target confirmed for November 15th.",
                    "API documentation must be refreshed prior to release.",
                    "Authentication issue identified and assigned for immediate fix.",
                ],
                "decisions": [
                    "Ship the beta release on November 15th.",
                ],
                "action_items": [item.model_dump() for item in action_items],
            }
        )

    def complete_text(self, system: str, user: str) -> str:
        if "email" in system.lower() or "email" in user.lower():
            return "Subject: Follow-up on Team Sync\n\nHi everyone,\n\nThanks for meeting today. We confirmed our beta release date for November 15th.\n\nBest,\nTeam Lead"
        return "Based on the meeting transcript, the project beta release is confirmed for November 15th [[05:12]]."

    def stream_text(self, system: str, user: str) -> Iterator[str]:
        full_text = self.complete_text(system, user)
        words = full_text.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")


def get_llm_client() -> LLMClient:
    if settings.LLM_PROVIDER == "fake":
        return FakeLLMClient()
    if settings.LLM_PROVIDER == "anthropic":
        return AnthropicClient()
    if settings.LLM_PROVIDER == "gemini":
        return GeminiLLMClient()
    return GeminiLLMClient()
