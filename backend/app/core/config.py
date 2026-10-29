from pathlib import Path
from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENV: str = "development"
    API_PORT: int = 8000

    DATABASE_URL: str = "postgresql+asyncpg://meet:meet@localhost:5432/meetscribe"
    DATABASE_URL_SYNC: str = "postgresql+psycopg://meet:meet@localhost:5432/meetscribe"
    TEST_DATABASE_URL: str = "postgresql+asyncpg://meet:meet@localhost:5432/meetscribe_test"
    TEST_DATABASE_URL_SYNC: str = "postgresql+psycopg://meet:meet@localhost:5432/meetscribe_test"
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET: str = "change-me"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 7

    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:5173"]

    STORAGE_BACKEND: str = "s3"  # "s3" or "local"
    LOCAL_STORAGE_DIR: str = ".data/uploads"

    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "minioadmin"
    S3_ENDPOINT_URL: str | None = "http://localhost:9000"
    S3_PUBLIC_ENDPOINT_URL: str | None = "http://localhost:9000"
    S3_BUCKET: str = "meetscribe"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_REGION: str = "us-east-1"
    MAX_UPLOAD_MB: int = 500

    TRANSCRIBER: str = "faster_whisper"  # "faster_whisper", "openai", "fake"
    WHISPER_MODEL: str = "small"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_COMPUTE_TYPE: str = "int8"

    LLM_PROVIDER: str = "anthropic"  # "anthropic", "fake"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "claude-sonnet-5-5"

    REAPER_STALE_MINUTES: int = 15
    MAX_PROCESS_ATTEMPTS: int = 3

    @field_validator("API_PORT")
    @classmethod
    def validate_api_port(cls, v: int) -> int:
        # Check against AirPlay Receiver reserved port
        forbidden_port = 5 * 1000
        if v == forbidden_port:
            raise ValueError(
                f"Port {v} is reserved by macOS for AirPlay Receiver and is strictly prohibited. "
                "Use port 8000."
            )
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


settings = Settings()
