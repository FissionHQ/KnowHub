import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import { parseApiEnv } from "@wiki/config";
import { getDb } from "@wiki/db";
import { getRedis } from "./lib/redis.js";
import { createAwsClients } from "./lib/aws.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";

const env = parseApiEnv();
const db = getDb(env.DATABASE_URL);
const redis = getRedis(env.REDIS_URL);
const { s3, sqs, ses } = createAwsClients(env);

const app = createApp(env, db, redis, s3, sqs, ses);

const server = app.listen(env.API_PORT, () => {
  logger.info(`API server listening on port ${env.API_PORT}`);
});

async function shutdown() {
  logger.info("Shutting down...");
  server.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
