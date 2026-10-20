#!/bin/sh
# Runs when LocalStack S3 is ready: create the private bucket MeetScribe uses.
set -e

echo "Creating S3 bucket: ${S3_BUCKET:-meetscribe}"
awslocal s3 mb "s3://${S3_BUCKET:-meetscribe}" || true
awslocal s3api put-bucket-acl --bucket "${S3_BUCKET:-meetscribe}" --acl private || true
awslocal s3 ls
