import json
import logging
import re
from typing import List, Optional, Protocol, Type, TypeVar

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


def get_llm_client() -> LLMClient:
    if settings.LLM_PROVIDER == "fake":
        return FakeLLMClient()
    return AnthropicClient()
