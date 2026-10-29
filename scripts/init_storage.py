#!/usr/bin/env python3
"""
Initialize storage backend for MeetScribe.
- In s3 mode: creates the bucket if missing using boto3.
- In local mode: creates the local upload directory.
"""
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.core.config import settings


def init_storage() -> None:
    if settings.STORAGE_BACKEND == "local":
        local_dir = Path(settings.LOCAL_STORAGE_DIR)
        local_dir.mkdir(parents=True, exist_ok=True)
        print(f"[OK] Local storage directory ready: {local_dir}")
        return

    import boto3
    from botocore.exceptions import ClientError

    print(f"Connecting to S3/MinIO at {settings.S3_ENDPOINT_URL}...")
    s3_client = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
    )

    bucket_name = settings.S3_BUCKET
    try:
        s3_client.head_bucket(Bucket=bucket_name)
        print(f"[OK] S3 Bucket '{bucket_name}' already exists.")
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "NoSuchBucket"):
            print(f"Creating bucket '{bucket_name}'...")
            kwargs = {"Bucket": bucket_name}
            if settings.S3_REGION and settings.S3_REGION != "us-east-1":
                kwargs["CreateBucketConfiguration"] = {"LocationConstraint": settings.S3_REGION}
            s3_client.create_bucket(**kwargs)
            print(f"[OK] Created S3 bucket '{bucket_name}'.")
        else:
            print(f"[ERROR] Failed to check/create bucket: {e}")
            sys.exit(1)


if __name__ == "__main__":
    init_storage()

