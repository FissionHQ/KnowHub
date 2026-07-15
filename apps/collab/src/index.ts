import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import { Server } from "@hocuspocus/server";
import { Redis as RedisExtension } from "@hocuspocus/extension-redis";
import { Redis } from "ioredis";
import { SQSClient } from "@aws-sdk/client-sqs";
import { parseCollabEnv } from "@wiki/config";
import { getDb } from "@wiki/db";
import { authenticateCollabConnection } from "./auth.js";
import {
  COLLAB_DOCUMENT_RESET_CHANNEL,
  collabDocumentName,
} from "@wiki/doc-collab";
import { recordLastEditor } from "./lastEditor.js";
import { loadCollabDocument, scheduleHtmlPersist, storeCollabYjsState } from "./persistence.js";
import { logger } from "./logger.js";

const env = parseCollabEnv();
const db = getDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);

const redisSubscriber = new Redis(env.REDIS_URL);

const sqs = new SQSClient({
  region: env.AWS_REGION,
  ...(env.SQS_ENDPOINT
    ? {
        endpoint: env.SQS_ENDPOINT,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID ?? "test",
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "test",
        },
      }
    : {}),
});

const server = Server.configure({
  port: env.COLLAB_PORT,
  extensions: [new RedisExtension({ redis })],

  async onAuthenticate({ token, documentName }) {
    const context = await authenticateCollabConnection(
      db,
      redis,
      env.JWT_SECRET,
      token,
      documentName,
    );
    return {
      user: {
        id: context.user.id,
        name: context.user.name,
        color: context.user.color,
      },
      canEdit: context.user.canEdit,
      orgId: context.orgId,
      documentId: context.documentId,
    };
  },

  async onConnect({ connection, context }) {
    if (context.canEdit === false) {
      connection.readOnly = true;
    }
  },

  async onLoadDocument({ document, context }) {
    try {
      await loadCollabDocument(
        db,
        context.orgId as string,
        context.documentId as string,
        document,
      );
    } catch (err) {
      logger.error("Failed to load collaborative document", {
        documentId: context.documentId,
        orgId: context.orgId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  },

  async onChange({ context }) {
    if (context.canEdit === false) return;

    const orgId = context.orgId as string | undefined;
    const documentId = context.documentId as string | undefined;
    const userId = (context.user as { id?: string } | undefined)?.id;

    if (orgId && documentId) {
      recordLastEditor(orgId, documentId, userId);
    }
  },

  async onStoreDocument({ document, context }) {
    const orgId = context.orgId as string;
    const documentId = context.documentId as string;

    await storeCollabYjsState(db, orgId, documentId, document);
    scheduleHtmlPersist(db, sqs, env.SQS_INDEX_QUEUE_URL, orgId, documentId, document);
  },
});

server.listen().then(() => {
  logger.info(`Collaboration server listening on port ${env.COLLAB_PORT}`);

  void redisSubscriber.subscribe(COLLAB_DOCUMENT_RESET_CHANNEL, (err) => {
    if (err) {
      logger.error("Failed to subscribe to collab document reset channel", {
        error: err.message,
      });
      return;
    }
    logger.info("Listening for collaborative document resets");
  });

  redisSubscriber.on("message", (channel, message) => {
    if (channel !== COLLAB_DOCUMENT_RESET_CHANNEL) return;

    try {
      const payload = JSON.parse(message) as { orgId?: string; documentId?: string };
      if (!payload.orgId || !payload.documentId) return;

      const documentName = collabDocumentName(payload.orgId, payload.documentId);
      const document = server.documents.get(documentName);
      if (!document) return;

      void server.unloadDocument(document).then(() => {
        logger.info("Unloaded collaborative document after version restore", {
          documentName,
        });
      });
    } catch (err) {
      logger.error("Failed to handle collaborative document reset", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
});

async function shutdown() {
  logger.info("Shutting down collaboration server...");
  await redisSubscriber.quit();
  await server.destroy();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
