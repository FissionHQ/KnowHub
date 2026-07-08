#!/bin/bash
# Runs inside LocalStack container on startup — creates S3 buckets and SQS queues

set -e

echo "Creating S3 buckets..."
awslocal s3 mb s3://wiki-quarantine
awslocal s3 mb s3://wiki-served

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
