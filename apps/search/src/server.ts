import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import express from "express";
import "express-async-errors";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { z } from "zod";
import { Client } from "@opensearch-project/opensearch";
import { parseSearchEnv } from "@wiki/config";
import { getDb } from "@wiki/db";
import { SearchService } from "./searchService.js";
import winston from "winston";
import { groupMemberships, groups } from "@wiki/db";
import { eq, and } from "drizzle-orm";
import * as jose from "jose";
import type { UserRole } from "@wiki/types";

const env = parseSearchEnv();
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const os = new Client({ node: env.OPENSEARCH_URL });
const db = getDb(env.DATABASE_URL);
const searchService = new SearchService(os);

const app = express();
app.use(helmet());
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(morgan("combined", { stream: { write: (m) => logger.info(m.trim()) } }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const querySchema = z.object({
  q: z.string().min(1).max(500),
  spaceId: z.string().uuid().optional(),
  type: z.enum(["page", "pdf"]).optional(),
  authorId: z.string().uuid().optional(),
  tags: z.string().optional().transform((v) => (v ? v.split(",") : undefined)),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

// Shared auth helper
async function extractTenant(req: express.Request) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const cookieToken = (req.cookies as Record<string, string>)?.["wiki_token"];
  const token = bearerToken ?? cookieToken;

  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  let payload: jose.JWTPayload;

  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    ({ payload } = await jose.jwtVerify(token, secret));
  } catch {
    throw Object.assign(new Error("Invalid token"), { status: 401 });
  }

  const orgId = payload["custom:org_id"] as string;
  const userId = payload["sub"] as string;
  const role = payload["custom:role"] as UserRole;

  if (!orgId || !userId) throw Object.assign(new Error("Invalid token claims"), { status: 401 });

  // Fetch group IDs
  const rows = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(and(eq(groupMemberships.userId, userId), eq(groups.orgId, orgId)));

  return { orgId, userId, role, groupIds: rows.map((r) => r.groupId) };
}

app.get("/search", async (req, res) => {
  const tenant = await extractTenant(req);
  const q = querySchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid query", details: q.error.flatten() } });
    return;
  }

  const results = await searchService.search(q.data as import("@wiki/types").SearchQuery, tenant.orgId, tenant.groupIds, tenant.userId);
  res.json({ data: results });
});

app.get("/search/suggest", async (req, res) => {
  const tenant = await extractTenant(req);
  const q = z.string().min(1).max(200).safeParse(req.query["q"]);
  if (!q.success) { res.json({ data: [] }); return; }

  const suggestions = await searchService.suggest(q.data, tenant.orgId, tenant.groupIds, tenant.userId);
  res.json({ data: suggestions });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : "Internal error";
  res.status(status).json({ error: { code: "ERROR", message } });
});

app.listen(env.SEARCH_PORT, () => {
  logger.info(`Search service listening on port ${env.SEARCH_PORT}`);
});
