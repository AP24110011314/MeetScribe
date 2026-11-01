from pathlib import Path
from typing import List, Union

from pydantic import field_validator, model_validator
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

    LLM_PROVIDER: str = "gemini"  # "gemini", "anthropic", "fake"
    LLM_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.5-flash"

    REAPER_STALE_MINUTES: int = 15
    MAX_PROCESS_ATTEMPTS: int = 3

    @property
    def effective_llm_api_key(self) -> str:
        return self.LLM_API_KEY or self.GEMINI_API_KEY

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            if v.startswith("postgresql://") and not v.startswith("postgresql+"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("DATABASE_URL_SYNC", mode="before")
    @classmethod
    def normalize_database_url_sync(cls, v: str) -> str:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+psycopg://", 1)
            if v.startswith("postgresql://") and not v.startswith("postgresql+"):
                return v.replace("postgresql://", "postgresql+psycopg://", 1)
            if v.startswith("postgresql+asyncpg://"):
                return v.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
        return v

    @field_validator("S3_ENDPOINT_URL", "S3_PUBLIC_ENDPOINT_URL", mode="before")
    @classmethod
    def normalize_empty_s3_endpoints(cls, v: str | None) -> str | None:
        if v is not None and isinstance(v, str) and not v.strip():
            return None
        return v

    @model_validator(mode="after")
    def sync_database_urls(self) -> "Settings":
        if self.DATABASE_URL and ("localhost" not in self.DATABASE_URL):
            if "localhost" in self.DATABASE_URL_SYNC:
                self.DATABASE_URL_SYNC = self.DATABASE_URL.replace(
                    "postgresql+asyncpg://", "postgresql+psycopg://"
                )
        if self.S3_ACCESS_KEY != "minioadmin" or self.ENV not in ("development", "test"):
            if self.S3_ENDPOINT_URL and (
                "localhost" in self.S3_ENDPOINT_URL or "127.0.0.1" in self.S3_ENDPOINT_URL
            ):
                self.S3_ENDPOINT_URL = None
            if self.S3_PUBLIC_ENDPOINT_URL and (
                "localhost" in self.S3_PUBLIC_ENDPOINT_URL
                or "127.0.0.1" in self.S3_PUBLIC_ENDPOINT_URL
            ):
                self.S3_PUBLIC_ENDPOINT_URL = None
        return self

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
