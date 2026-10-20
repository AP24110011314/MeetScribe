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

    # S3-compatible storage. An empty endpoint means "use AWS default" (see D11).
    s3_endpoint_url: str = "http://localhost:9000"
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

    # LLM
    llm_provider: str = "anthropic"
    llm_api_key: str = ""
    llm_model: str = "claude-sonnet-4-6"

    # Uploads
    max_upload_mb: int = 500

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
