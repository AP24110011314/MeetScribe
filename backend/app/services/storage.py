"""S3 storage access (ARCHITECTURE.md). All S3 calls go through this interface."""

from pathlib import Path
from typing import Protocol

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings

# Presigned URLs are short-lived and scoped to a single key (ARCHITECTURE.md security).
PRESIGN_EXPIRES_SEC = 15 * 60


class StorageService(Protocol):
    """S3 operations the app needs. Implementations are mockable in tests."""

    def presign_put(self, key: str, content_type: str) -> str: ...

    def presign_get(self, key: str) -> str: ...

    def head_object(self, key: str) -> dict[str, object] | None: ...

    def object_exists(self, key: str) -> bool: ...

    def delete_object(self, key: str) -> None: ...

    def download_to_file(self, key: str, destination: Path) -> None: ...

    def upload_file(self, key: str, source: Path, content_type: str) -> None: ...


def audio_object_key(user_id: str, meeting_id: str, filename: str) -> str:
    """Canonical S3 key for an upload (single-key scope, per ARCHITECTURE.md)."""
    return f"uploads/{user_id}/{meeting_id}/{filename}"


def normalized_object_key(user_id: str, meeting_id: str) -> str:
    """S3 key for the normalized 16 kHz mono WAV produced in Phase 4."""
    return f"normalized/{user_id}/{meeting_id}.wav"


class S3StorageService:
    """boto3-backed S3 client. Works with LocalStack locally and AWS S3 in prod."""

    def __init__(
        self,
        *,
        endpoint_url: str,
        public_endpoint_url: str,
        bucket: str,
        access_key: str,
        secret_key: str,
        region: str,
    ) -> None:
        # An empty endpoint means "use AWS's default endpoints" (D11).
        self._bucket = bucket
        self._public_endpoint_url = public_endpoint_url or None
        self._internal = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4"),
        )
        # Separate client used only to build browser-reachable presigned URLs, so the
        # host in the URL matches what the browser can resolve (D11).
        self._signer = (
            self._internal
            if (public_endpoint_url or endpoint_url) == endpoint_url
            else boto3.client(
                "s3",
                endpoint_url=public_endpoint_url or None,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name=region,
                config=Config(signature_version="s3v4"),
            )
        )

    def presign_put(self, key: str, content_type: str) -> str:
        return str(
            self._signer.generate_presigned_url(
                "put_object",
                Params={"Bucket": self._bucket, "Key": key, "ContentType": content_type},
                ExpiresIn=PRESIGN_EXPIRES_SEC,
            )
        )

    def presign_get(self, key: str) -> str:
        return str(
            self._signer.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=PRESIGN_EXPIRES_SEC,
            )
        )

    def head_object(self, key: str) -> dict[str, object] | None:
        try:
            response = self._internal.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
        return dict(response)

    def object_exists(self, key: str) -> bool:
        return self.head_object(key) is not None

    def delete_object(self, key: str) -> None:
        self._internal.delete_object(Bucket=self._bucket, Key=key)

    def download_to_file(self, key: str, destination: Path) -> None:
        """Stream an object to a local file without buffering it all in memory."""
        destination.parent.mkdir(parents=True, exist_ok=True)
        self._internal.download_file(self._bucket, key, str(destination))

    def upload_file(self, key: str, source: Path, content_type: str) -> None:
        """Upload a local file to S3 with the given content type."""
        self._internal.upload_file(
            str(source), self._bucket, key, ExtraArgs={"ContentType": content_type}
        )


def get_storage_service() -> StorageService:
    """FastAPI/dependency factory building the configured storage service."""
    settings = get_settings()
    return S3StorageService(
        endpoint_url=settings.s3_endpoint_url,
        public_endpoint_url=settings.s3_public_endpoint_url,
        bucket=settings.s3_bucket,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        region=settings.s3_region,
    )
