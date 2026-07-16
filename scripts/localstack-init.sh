#!/bin/bash
# Runs inside LocalStack container on startup â€” creates S3 buckets and SQS queues

set -e

echo "Creating S3 buckets..."
awslocal s3 mb s3://wiki-quarantine || true
awslocal s3 mb s3://wiki-served || true

echo "Creating SQS queues..."
awslocal sqs create-queue --queue-name wiki-pdf-processing-dlq || true
awslocal sqs create-queue --queue-name wiki-search-indexing-dlq || true
awslocal sqs create-queue --queue-name wiki-pdf-processing || true
awslocal sqs create-queue --queue-name wiki-search-indexing || true

echo "LocalStack init complete."
