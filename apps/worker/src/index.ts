import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";
import { S3Client } from "@aws-sdk/client-s3";
import { SESClient } from "@aws-sdk/client-ses";
import { parseWorkerEnv } from "@wiki/config";
import { getDb, setTenantContext, purgeExpiredAuditLogs, purgeExpiredTrash } from "@wiki/db";
import { createOpenSearchClient, ensureIndex, INDEX_NAME } from "./opensearch.js";
import { PdfProcessor } from "./pdfProcessor.js";
import { Indexer } from "./indexer.js";
import { logger } from "./logger.js";
import type { PdfProcessingMessage, SearchIndexMessage } from "@wiki/types";

const env = parseWorkerEnv();

const awsBase = {
  region: env.AWS_REGION,
  ...(env.AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  }),
};

const sqs = new SQSClient({ ...awsBase, ...(env.SQS_ENDPOINT ? { endpoint: env.SQS_ENDPOINT } : {}) });
const s3 = new S3Client({ ...awsBase, ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}) });
const ses = new SESClient({ ...awsBase, ...(env.SES_ENDPOINT ? { endpoint: env.SES_ENDPOINT } : {}) });
const os = createOpenSearchClient(env.OPENSEARCH_URL);
const db = getDb(env.DATABASE_URL);

const pdfProcessor = new PdfProcessor(db, s3, os, ses, {
  quarantineBucket: env.S3_QUARANTINE_BUCKET,
  servedBucket: env.S3_SERVED_BUCKET,
  sesFromAddress: env.SES_FROM_ADDRESS,
});
const indexer = new Indexer(db, os);

let running = true;

async function pollQueue(queueUrl: string): Promise<void> {
  while (running) {
    try {
      const result = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 5,
          WaitTimeSeconds: 20, // long polling
          VisibilityTimeout: 300, // 5 min processing window
        }),
      );

      if (!result.Messages?.length) continue;

      await Promise.all(
        result.Messages.map(async (msg) => {
          if (!msg.Body || !msg.ReceiptHandle) return;

          try {
            const payload = JSON.parse(msg.Body) as { type: string };

            if (payload.type === "PDF_PROCESSING") {
              const data = payload as PdfProcessingMessage;
              await setTenantContext(db, data.orgId);
              await pdfProcessor.process(data);
            } else if (payload.type === "SEARCH_INDEX") {
              const data = payload as SearchIndexMessage;
              await setTenantContext(db, data.orgId);
              await indexer.handle(data);
            } else {
              logger.warn("Unknown message type", { type: payload.type });
            }

            // Delete message on success
            await sqs.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: msg.ReceiptHandle,
              }),
            );
          } catch (err) {
            logger.error("Message processing failed — will retry", { err, msgId: msg.MessageId });
            // Message will become visible again after VisibilityTimeout
          }
        }),
      );
    } catch (err) {
      logger.error("SQS poll error", { err });
      await sleep(5000);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await ensureIndex(os);
  logger.info("Worker started, polling queues...");

  // Purge expired audit logs every 24 hours
  const purgeAudit = async () => {
    try {
      await purgeExpiredAuditLogs(db);
      logger.info("Audit log retention purge completed");
    } catch (err) {
      logger.error("Audit log purge failed", { err });
    }
  };
  await purgeAudit();
  setInterval(purgeAudit, 24 * 60 * 60 * 1000);

  const purgeTrash = async () => {
    try {
      const purged = await purgeExpiredTrash(db);
      for (const doc of purged) {
        try {
          await setTenantContext(db, doc.orgId);
          await os.delete({ index: INDEX_NAME, id: doc.documentId, refresh: "wait_for" });
        } catch (err) {
          logger.warn("Failed to remove purged document from search index", {
            documentId: doc.documentId,
            err,
          });
        }
        logger.info("Permanently purged trashed document", {
          documentId: doc.documentId,
          orgId: doc.orgId,
          title: doc.title,
        });
      }
      if (purged.length) {
        logger.info("Trash retention purge completed", { count: purged.length });
      }
    } catch (err) {
      logger.error("Trash purge failed", { err });
    }
  };
  await purgeTrash();
  setInterval(purgeTrash, 24 * 60 * 60 * 1000);

  // Poll both queues concurrently
  await Promise.all([
    pollQueue(env.SQS_PDF_QUEUE_URL),
    pollQueue(env.SQS_INDEX_QUEUE_URL),
  ]);
}

process.on("SIGTERM", () => { running = false; });
process.on("SIGINT", () => { running = false; });

main().catch((err) => {
  logger.error("Worker fatal error", { err });
  process.exit(1);
});
