import { z } from "zod";

/** S3 SSE-S3 algorithm used for all uploads and copies. No KMS. */
export const S3_SERVER_SIDE_ENCRYPTION = "AES256" as const;

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_READER: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_QUARANTINE_BUCKET: z.string(),
  S3_SERVED_BUCKET: z.string(),
  OPENSEARCH_URL: z.string().url(),
  SQS_ENDPOINT: z.string().url().optional(),
  SQS_PDF_QUEUE_URL: z.string().url(),
  SQS_INDEX_QUEUE_URL: z.string().url(),
  BASE_DOMAIN: z.string(),
  JWT_SECRET: z.string().min(32),
  SES_ENDPOINT: z.string().url().optional(),
  SES_FROM_ADDRESS: z.string().email(),
  PLATFORM_ADMIN_SECRET: z.string().min(16).optional(),
});

const apiSchema = baseSchema.extend({
  API_PORT: z.coerce.number().default(3001),
});

const searchSchema = baseSchema.extend({
  SEARCH_PORT: z.coerce.number().default(3002),
});

const workerSchema = baseSchema;

export function parseApiEnv(env: NodeJS.ProcessEnv = process.env) {
  const result = apiSchema.safeParse(env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export function parseSearchEnv(env: NodeJS.ProcessEnv = process.env) {
  const result = searchSchema.safeParse(env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export function parseWorkerEnv(env: NodeJS.ProcessEnv = process.env) {
  const result = workerSchema.safeParse(env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export type ApiEnv = ReturnType<typeof parseApiEnv>;
export type SearchEnv = ReturnType<typeof parseSearchEnv>;
export type WorkerEnv = ReturnType<typeof parseWorkerEnv>;
