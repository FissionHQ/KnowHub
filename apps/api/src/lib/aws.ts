import { S3Client } from "@aws-sdk/client-s3";
import { SESClient } from "@aws-sdk/client-ses";
import { SQSClient } from "@aws-sdk/client-sqs";
import type { ApiEnv } from "@wiki/config";

export function createAwsClients(env: ApiEnv) {
  const base = {
    region: env.AWS_REGION,
    ...(env.AWS_ACCESS_KEY_ID && {
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    }),
  };

  const s3 = new S3Client({
    ...base,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
  });

  const sqs = new SQSClient({
    ...base,
    ...(env.SQS_ENDPOINT ? { endpoint: env.SQS_ENDPOINT } : {}),
  });

  const ses = new SESClient({
    ...base,
    ...(env.SES_ENDPOINT ? { endpoint: env.SES_ENDPOINT } : {}),
  });

  return { s3, sqs, ses };
}
