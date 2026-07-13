#!/bin/bash
# Runs inside LocalStack container on startup — creates S3 buckets and SQS queues

set -e

echo "Creating S3 buckets with AES256 default encryption..."
awslocal s3 mb s3://wiki-quarantine
awslocal s3 mb s3://wiki-served

for bucket in wiki-quarantine wiki-served; do
  awslocal s3api put-bucket-encryption --bucket "$bucket" \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
done

echo "Configuring S3 CORS (required for PDF.js cross-origin fetch from the web app)..."
CORS_CONFIG='{"CORSRules":[{"AllowedHeaders":["*"],"AllowedMethods":["GET","HEAD"],"AllowedOrigins":["http://localhost:3000","http://127.0.0.1:3000"],"ExposeHeaders":["Accept-Ranges","Content-Length","Content-Type","Content-Range","ETag"],"MaxAgeSeconds":3600}]}'
for bucket in wiki-quarantine wiki-served; do
  awslocal s3api put-bucket-cors --bucket "$bucket" --cors-configuration "$CORS_CONFIG"
done

echo "Creating SQS queues with DLQs..."
awslocal sqs create-queue --queue-name wiki-pdf-processing-dlq
awslocal sqs create-queue --queue-name wiki-search-indexing-dlq

DLQ_PDF=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/wiki-pdf-processing-dlq \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

DLQ_IDX=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/wiki-search-indexing-dlq \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

awslocal sqs create-queue --queue-name wiki-pdf-processing \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_PDF\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

awslocal sqs create-queue --queue-name wiki-search-indexing \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_IDX\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

echo "LocalStack init complete."
