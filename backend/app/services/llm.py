"""LLM access (docs/ARCHITECTURE.md).

`LLMClient` is the seam: the default is Anthropic's Messages API, selectable via
`LLM_PROVIDER` (D42). Provider SDKs are imported lazily so the API process and the test
suite never require a key or a network call (D7), and every client is responsible for
asking the model for JSON and parsing it into the requested Pydantic schema.

Errors are classified so the pipeline can retry: transport/5xx/rate-limit problems raise
`TransientLLMError`, while a response that cannot be parsed into the schema raises
`LLMValidationError` (the caller retries once with the error appended, then gives up).
"""

import json
import logging
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SchemaT = TypeVar("SchemaT", bound=BaseModel)

# Keep responses bounded; summaries plus action items are small (docs/PROMPTS.md).
DEFAULT_MAX_TOKENS = 4096


class LLMError(Exception):
    """Base class for LLM failures."""


class TransientLLMError(LLMError):
    """Rate limit / timeout / 5xx: worth retrying."""


class LLMValidationError(LLMError):
    """The model responded but the payload did not match the requested schema."""


class LLMClient(Protocol):
    """Produces a validated Pydantic object from a system + user prompt pair."""

    @property
    def model_name(self) -> str: ...

    def complete_json(self, system: str, user: str, schema: type[SchemaT]) -> SchemaT: ...


def parse_json_response(text: str, schema: type[SchemaT]) -> SchemaT:
    """Parse a model's text response into `schema`.

    Tolerates the common wrapping mistakes (markdown fences, leading prose) by extracting
    the outermost JSON object before validating. Raises `LLMValidationError` when the text
    is not usable, with a short, non-sensitive message.
    """
    candidate = _extract_json_object(text)
    if candidate is None:
        raise LLMValidationError("LLM response contained no JSON object")
    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise LLMValidationError(f"LLM response was not valid JSON: {exc.msg}") from exc
    try:
        return schema.model_validate(payload)
    except ValidationError as exc:
        # Compact, 1-based location + message, e.g. "action_items.0.owner: ...".
        first = exc.errors()[0]
        location = ".".join(str(part) for part in first["loc"]) or "<root>"
        raise LLMValidationError(f"{location}: {first['msg']}") from exc


def _extract_json_object(text: str) -> str | None:
    """Return the outermost `{...}` span, ignoring fences and surrounding prose."""
    stripped = text.strip()
    if stripped.startswith("```"):
        # Drop a leading ```json / ``` fence and the trailing fence.
        stripped = stripped.split("\n", 1)[-1]
        stripped = stripped.rsplit("```", 1)[0].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    return stripped[start : end + 1]


class AnthropicLLMClient:
    """Anthropic Messages API client. The SDK is imported on first use only."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        temperature: float = 0.0,
    ) -> None:
        if not api_key:
            raise LLMError("LLM_API_KEY is required for the Anthropic provider")
        self._api_key = api_key
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._client: object | None = None

    @property
    def model_name(self) -> str:
        return f"anthropic:{self._model}"

    def _get_client(self) -> object:
        if self._client is None:
            import anthropic  # local import: optional/heavy dependency

            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def complete_json(self, system: str, user: str, schema: type[SchemaT]) -> SchemaT:
        client = self._get_client()
        try:
            message = client.messages.create(  # type: ignore[attr-defined]
                model=self._model,
                max_tokens=self._max_tokens,
                temperature=self._temperature,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except Exception as exc:  # SDK error types vary; all are retryable at this layer
            raise TransientLLMError(f"Anthropic request failed: {exc}") from exc

        text = _message_text(message)
        return parse_json_response(text, schema)


class OpenAICompatibleLLMClient:
    """OpenAI-compatible chat completions client (optional provider, D42).

    Works with the OpenAI API or any compatible endpoint by setting `LLM_BASE_URL`.
    The SDK is imported lazily.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        temperature: float = 0.0,
    ) -> None:
        if not api_key:
            raise LLMError("LLM_API_KEY is required for the OpenAI provider")
        self._api_key = api_key
        self._model = model
        self._base_url = base_url
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._client: object | None = None

    @property
    def model_name(self) -> str:
        return f"openai:{self._model}"

    def _get_client(self) -> object:
        if self._client is None:
            from openai import OpenAI  # local import: optional dependency

            kwargs: dict[str, Any] = {"api_key": self._api_key}
            if self._base_url:
                kwargs["base_url"] = self._base_url
            self._client = OpenAI(**kwargs)
        return self._client

    def complete_json(self, system: str, user: str, schema: type[SchemaT]) -> SchemaT:
        client = self._get_client()
        try:
            completion = client.chat.completions.create(  # type: ignore[attr-defined]
                model=self._model,
                max_tokens=self._max_tokens,
                temperature=self._temperature,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
        except Exception as exc:
            raise TransientLLMError(f"OpenAI request failed: {exc}") from exc

        text = completion.choices[0].message.content or ""
        return parse_json_response(text, schema)


def _message_text(message: object) -> str:
    """Concatenate the text blocks of an Anthropic Messages response."""
    blocks = getattr(message, "content", None) or []
    parts: list[str] = []
    for block in blocks:
        text = getattr(block, "text", None)
        if text:
            parts.append(str(text))
    return "\n".join(parts)


def get_llm_client() -> LLMClient:
    """Build the configured LLM client. Default provider is Anthropic (AGENTS.md)."""
    settings = get_settings()
    provider = settings.llm_provider.lower()
    if provider == "anthropic":
        return AnthropicLLMClient(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            max_tokens=settings.llm_max_tokens,
        )
    if provider in {"openai", "openai_compatible"}:
        return OpenAICompatibleLLMClient(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            base_url=settings.llm_base_url or None,
            max_tokens=settings.llm_max_tokens,
        )
    raise LLMError(f"Unknown LLM_PROVIDER {settings.llm_provider!r}")
