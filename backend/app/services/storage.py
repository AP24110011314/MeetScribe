import shutil
from pathlib import Path
from typing import Any, Protocol, Tuple

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import settings

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class StorageService(Protocol):
    def presign_upload(
        self, key: str, content_type: str, max_size_bytes: int, expires_in: int = 900
    ) -> Tuple[str, dict[str, str]]: ...

    def presign_download(self, key: str, expires_in: int = 900) -> str: ...

    def exists(self, key: str) -> bool: ...

    def download_to(self, key: str, path: Path) -> None: ...

    def upload_from(self, key: str, path: Path, content_type: str | None = None) -> None: ...

    def delete(self, prefix_or_key: str) -> None: ...


class S3StorageService:
    def __init__(self) -> None:
        self.bucket = settings.S3_BUCKET
        self.endpoint_url = settings.S3_ENDPOINT_URL or None
        self.public_endpoint_url = (
            settings.S3_PUBLIC_ENDPOINT_URL or settings.S3_ENDPOINT_URL or None
        )

        # MinIO requires path-style addressing; real AWS S3 (when endpoint_url is None) requires auto/virtual-host style
        s3_extra: dict[str, Any] = {}
        if self.endpoint_url:
            s3_extra["addressing_style"] = "path"

        boto_config = Config(
            signature_version="s3v4",
            s3=s3_extra if s3_extra else None,
        )

        presign_s3_extra: dict[str, Any] = {}
        if self.public_endpoint_url:
            presign_s3_extra["addressing_style"] = "path"

        presign_boto_config = Config(
            signature_version="s3v4",
            s3=presign_s3_extra if presign_s3_extra else None,
        )

        # Internal client for server-side calls (head, download, upload, delete)
        self.client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=boto_config,
        )

        # Presign client configured with public endpoint reachable by browser/client
        self.presign_client = boto3.client(
            "s3",
            endpoint_url=self.public_endpoint_url,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=presign_boto_config,
        )

    def presign_upload(
        self, key: str, content_type: str, max_size_bytes: int, expires_in: int = 900
    ) -> Tuple[str, dict[str, str]]:
        url = str(
            self.presign_client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
        )
        headers = {"Content-Type": content_type}
        return url, headers

    def presign_download(self, key: str, expires_in: int = 900) -> str:
        url = str(
            self.presign_client.generate_presigned_url(
                ClientMethod="get_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                },
                ExpiresIn=expires_in,
            )
        )
        return url

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("404", "NoSuchKey", "NoSuchBucket"):
                return False
            return False

    def download_to(self, key: str, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(self.bucket, key, str(path))

    def upload_from(self, key: str, path: Path, content_type: str | None = None) -> None:
        extra_args: dict[str, Any] = {}
        if content_type:
            extra_args["ContentType"] = content_type
        self.client.upload_file(str(path), self.bucket, key, ExtraArgs=extra_args)

    def delete(self, prefix_or_key: str) -> None:
        # Check if single key exists
        try:
            self.client.delete_object(Bucket=self.bucket, Key=prefix_or_key)
        except Exception:
            pass

        # Also delete all objects with this prefix (for uploads/{user_id}/{meeting_id}/)
        try:
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix_or_key):
                if "Contents" in page:
                    objects = [{"Key": obj["Key"]} for obj in page["Contents"]]
                    self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": objects})
        except Exception:
            pass


class LocalStorageService:
    def __init__(self) -> None:
        self.base_dir = (
            Path(settings.LOCAL_STORAGE_DIR)
            if Path(settings.LOCAL_STORAGE_DIR).is_absolute()
            else PROJECT_ROOT / settings.LOCAL_STORAGE_DIR
        )
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.serializer = URLSafeTimedSerializer(settings.JWT_SECRET, salt="dev-storage")
        self.api_base_url = f"http://127.0.0.1:{settings.API_PORT}"

    def generate_token(self, key: str, action: str, expires_in: int = 900) -> str:
        data = {"key": key, "action": action}
        token: str = self.serializer.dumps(data)
        return token

    def verify_token(self, token: str, max_age: int = 900) -> dict[str, Any]:
        try:
            data: dict[str, Any] = self.serializer.loads(token, max_age=max_age)
            return data
        except SignatureExpired:
            raise ValueError("Token has expired")
        except BadSignature:
            raise ValueError("Invalid or tampered token")

    def presign_upload(
        self, key: str, content_type: str, max_size_bytes: int, expires_in: int = 900
    ) -> Tuple[str, dict[str, str]]:
        token = self.generate_token(key=key, action="upload", expires_in=expires_in)
        url = f"{self.api_base_url}/api/v1/dev-storage/upload/{token}"
        headers = {"Content-Type": content_type}
        return url, headers

    def presign_download(self, key: str, expires_in: int = 900) -> str:
        token = self.generate_token(key=key, action="download", expires_in=expires_in)
        return f"{self.api_base_url}/api/v1/dev-storage/download/{token}"

    def exists(self, key: str) -> bool:
        target = self.base_dir / key
        return target.is_file()

    def download_to(self, key: str, path: Path) -> None:
        target = self.base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, path)

    def upload_from(self, key: str, path: Path, content_type: str | None = None) -> None:
        target = self.base_dir / key
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

    def delete(self, prefix_or_key: str) -> None:
        target = self.base_dir / prefix_or_key
        if target.is_file():
            target.unlink()
        elif target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        else:
            # Check for partial prefix
            parent = target.parent
            if parent.exists() and parent.is_dir():
                for item in parent.glob(f"{target.name}*"):
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item, ignore_errors=True)


def get_storage_service() -> StorageService:
    if settings.STORAGE_BACKEND == "local":
        return LocalStorageService()
    return S3StorageService()
