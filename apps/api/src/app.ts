import express from "express";
import "express-async-errors";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import { requestId } from "./middleware/requestId.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createTenantContextMiddleware } from "./middleware/tenantContext.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createIdentityRouter } from "./domains/identity/router.js";
import { createAccessRouter } from "./domains/access/router.js";
import { createNavigationRouter } from "./domains/navigation/router.js";
import { createUserActivityRouter } from "./domains/navigation/userActivityRouter.js";
import { createContentRouter } from "./domains/content/router.js";
import { createCommentsRouter } from "./domains/content/commentsRouter.js";
import { createStorageRouter } from "./domains/storage/router.js";
import { createAdminRouter } from "./domains/admin/router.js";
import { createAuthRouter } from "./domains/auth/router.js";
import type { ApiEnv } from "@wiki/config";
import type { Db } from "@wiki/db";
import type { Redis } from "ioredis";
import type { S3Client } from "@aws-sdk/client-s3";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { SESClient } from "@aws-sdk/client-ses";
import { logger } from "./lib/logger.js";

export function createApp(
  env: ApiEnv,
  db: Db,
  redis: Redis,
  s3: S3Client,
  sqs: SQSClient,
  ses: SESClient,
): express.Express {
  const app = express();

  // ─── Core middleware ────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || origin.endsWith(`.${env.BASE_DOMAIN}`) || env.NODE_ENV === "development") {
        cb(null, true);
      } else {
        cb(new Error("CORS: origin not allowed"));
      }
    },
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(requestId);
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );

  // ─── Health ─────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ─── Public auth routes ─────────────────────────────────────────────────
  app.use("/api/auth", createAuthRouter(db, env, ses));

  // ─── Authenticated routes ───────────────────────────────────────────────
  const auth = createAuthMiddleware({
    jwtSecret: env.JWT_SECRET,
    baseDomain: env.BASE_DOMAIN,
  });

  const tenantCtx = createTenantContextMiddleware(db, redis);

  const api = express.Router();
  api.use(auth, tenantCtx);

  api.use(createIdentityRouter(db, redis, ses, env));
  api.use(createAccessRouter(db, redis));
  api.use(createNavigationRouter(db));
  api.use(createUserActivityRouter(db));
  api.use(createContentRouter(db, sqs, env.SQS_INDEX_QUEUE_URL, redis));
  api.use(createCommentsRouter(db));
  api.use(
    createStorageRouter(db, s3, sqs, {
      quarantineBucket: env.S3_QUARANTINE_BUCKET,
      servedBucket: env.S3_SERVED_BUCKET,
      pdfQueueUrl: env.SQS_PDF_QUEUE_URL,
    }),
  );
  api.use(createAdminRouter(db));

  app.use("/api", api);

  // ─── Error handler (must be last) ──────────────────────────────────────
  app.use(errorHandler);

  return app;
}
