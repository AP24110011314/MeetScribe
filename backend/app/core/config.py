"""Application settings. All configuration comes from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed view of the environment. See `.env.example` for the full list."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    env: str = "development"

    # Data stores
    database_url: str = "postgresql+asyncpg://meet:meet@localhost:5432/meetscribe"
    redis_url: str = "redis://localhost:6379/0"

    # Auth (set a strong value outside local dev; never commit secrets)
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # S3-compatible storage. An empty endpoint means "use AWS default" (see D11).
    # Local dev uses LocalStack (D13); prod uses real AWS S3.
    s3_endpoint_url: str = "http://localhost:4566"
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_bucket: str = "meetscribe"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"

    # Transcription
    transcriber: str = "faster_whisper"
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    transcribe_language: str = ""  # "" means auto-detect
    openai_api_key: str = ""  # only for TRANSCRIBER=openai (D6)
    openai_whisper_model: str = "whisper-1"
    audio_chunk_seconds: int = 30 * 60  # long recordings are split into these windows (D31)

    # LLM
    llm_provider: str = "anthropic"
    llm_api_key: str = ""
    llm_model: str = "claude-sonnet-4-6"
    llm_max_tokens: int = 4096
    llm_base_url: str = ""  # only for openai_compatible providers
    # Analysis routing: transcripts at or under this budget go in a single call; longer
    # ones use map-reduce over MAP_WINDOW_SEC windows (D37/D38).
    analysis_token_budget: int = 20_000
    map_window_sec: int = 600

    # Uploads
    max_upload_mb: int = 500

    # Worker temp space: each job gets a directory here, always removed in `finally`.
    worker_temp_dir: str = "/tmp/meetscribe"

    # Processing pipeline (ARCHITECTURE.md reliability rules)
    pipeline_max_retries: int = 3  # bounded retries per stage, exponential backoff
    stuck_meeting_minutes: int = 60  # beat marks meetings stuck longer than this as failed

    # CORS
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance (env is read once per process)."""
    return Settings()
