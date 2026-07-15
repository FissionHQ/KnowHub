import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { auditLog, organizations } from "@wiki/db";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { recordAudit } from "../../lib/audit.js";

const brandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const orgSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  branding: brandingSchema.optional(),
  maxFileSizeBytes: z.number().int().min(1_048_576).max(524_288_000).optional(),
  trashRetentionDays: z.number().int().min(1).max(365).optional(),
  auditRetentionDays: z.number().int().min(30).max(3650).optional(),
});

export function createAdminRouter(db: Db): Router {
  const router = Router();

  // All admin routes require admin role
  router.use((req, _res, next) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();
    next();
  });

  // GET /admin/settings
  router.get("/admin/settings", async (req, res) => {
    const { orgId } = req.tenant;
    const rows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    if (!rows.length) throw new NotFoundError("Organization");
    res.json({ data: rows[0] });
  });

  // GET /admin/audit-log
  router.get("/admin/audit-log", async (req, res) => {
    const { orgId } = req.tenant;
    const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
    const offset = Number(req.query["offset"] ?? 0);
    const action = req.query["action"];
    const actorId = req.query["actorId"];
    const from = req.query["from"];
    const to = req.query["to"];

    const conditions = [eq(auditLog.orgId, orgId)];
    if (typeof action === "string" && action.length) {
      conditions.push(eq(auditLog.action, action));
    }
    if (typeof actorId === "string" && actorId.length) {
      conditions.push(eq(auditLog.actorId, actorId));
    }
    if (typeof from === "string" && from.length) {
      conditions.push(gte(auditLog.timestamp, new Date(from)));
    }
    if (typeof to === "string" && to.length) {
      conditions.push(lte(auditLog.timestamp, new Date(to)));
    }

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.timestamp))
      .limit(limit)
      .offset(offset);

    res.json({ data: rows });
  });

  // PATCH /admin/settings
  router.patch("/admin/settings", async (req, res) => {
    const body = orgSettingsSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId } = req.tenant;
    const updated = await db
      .update(organizations)
      .set({
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.branding !== undefined ? { branding: body.data.branding } : {}),
        ...(body.data.maxFileSizeBytes !== undefined
          ? { maxFileSizeBytes: body.data.maxFileSizeBytes }
          : {}),
        ...(body.data.trashRetentionDays !== undefined
          ? { trashRetentionDays: body.data.trashRetentionDays }
          : {}),
        ...(body.data.auditRetentionDays !== undefined
          ? { auditRetentionDays: body.data.auditRetentionDays }
          : {}),
      })
      .where(eq(organizations.id, orgId))
      .returning();

    await recordAudit(db, {
      orgId,
      actorId: req.tenant.userId,
      action: "org.settings_update",
      target: { type: "organization", orgId, changes: body.data },
      req,
    });

    res.json({ data: updated[0] });
  });

  return router;
}
