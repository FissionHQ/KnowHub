import { Router } from "express";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import { spaces, spacePermissions, groups } from "@wiki/db";
import { ValidationError, NotFoundError, ForbiddenError } from "../../lib/errors.js";
import { assertSpaceAccess } from "../access/permissionResolver.js";
import { recordAudit } from "../../lib/audit.js";

const createSpaceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  iconEmoji: z.string().max(10).optional(),
  groupPermissions: z
    .array(
      z.object({
        groupId: z.string().uuid(),
        accessLevel: z.enum(["view", "edit"]),
      }),
    )
    .min(0),
});

const updateSpacePermissionsSchema = z.object({
  groupPermissions: z
    .array(
      z.object({
        groupId: z.string().uuid(),
        accessLevel: z.enum(["view", "edit"]),
      }),
    )
    .min(0),
});

export function createNavigationRouter(db: Db): Router {
  const router = Router();

  // GET /spaces — list spaces visible to current user
  router.get("/spaces", async (req, res) => {
    const { orgId, userRole, groupIds } = req.tenant;

    if (userRole === "admin") {
      const rows = await db
        .select()
        .from(spaces)
        .where(eq(spaces.orgId, orgId));
      return res.json({ data: rows });
    }

    if (!groupIds.length) return res.json({ data: [] });

    const accessible = await db
      .select({ spaceId: spacePermissions.spaceId })
      .from(spacePermissions)
      .where(inArray(spacePermissions.groupId, groupIds));

    const spaceIds = [...new Set(accessible.map((r) => r.spaceId))];
    if (!spaceIds.length) return res.json({ data: [] });

    const rows = await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.orgId, orgId), inArray(spaces.id, spaceIds)));

    res.json({ data: rows });
  });

  // POST /spaces
  router.post("/spaces", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const body = createSpaceSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const spaceId = uuidv4();
    const inserted = await db
      .insert(spaces)
      .values({
        id: spaceId,
        orgId: req.tenant.orgId,
        name: body.data.name,
        description: body.data.description ?? null,
        iconEmoji: body.data.iconEmoji ?? null,
        createdBy: req.tenant.userId,
      })
      .returning();

    if (body.data.groupPermissions.length) {
      await db.insert(spacePermissions).values(
        body.data.groupPermissions.map((p) => ({
          spaceId,
          groupId: p.groupId,
          accessLevel: p.accessLevel,
        })),
      );
    }

    await recordAudit(db, {
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
      action: "space.create",
      target: {
        spaceId,
        name: body.data.name,
        groupPermissions: body.data.groupPermissions,
      },
      req,
    });

    if (body.data.groupPermissions.length) {
      await recordAudit(db, {
        orgId: req.tenant.orgId,
        actorId: req.tenant.userId,
        action: "space.permission_change",
        target: {
          spaceId,
          groupPermissions: body.data.groupPermissions,
          operation: "initial",
        },
        req,
      });
    }

    res.status(201).json({ data: inserted[0] });
  });

  // GET /spaces/:spaceId
  router.get("/spaces/:spaceId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { spaceId } = req.params;

    await assertSpaceAccess({
      db,
      userRole,
      userId,
      groupIds,
      spaceId: spaceId ?? "",
      required: "view",
    });

    const rows = await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.id, spaceId ?? ""), eq(spaces.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Space");
    res.json({ data: rows[0] });
  });

  // GET /spaces/:spaceId/permissions — space group ACL (admin only)
  router.get("/spaces/:spaceId/permissions", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const { spaceId } = req.params;
    const { orgId } = req.tenant;

    const rows = await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.id, spaceId ?? ""), eq(spaces.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Space");

    const perms = await db
      .select({
        groupId: spacePermissions.groupId,
        groupName: groups.name,
        accessLevel: spacePermissions.accessLevel,
      })
      .from(spacePermissions)
      .innerJoin(groups, eq(spacePermissions.groupId, groups.id))
      .where(eq(spacePermissions.spaceId, spaceId ?? ""));

    res.json({ data: perms });
  });

  // PATCH /spaces/:spaceId/permissions — replace space group ACL (admin only)
  router.patch("/spaces/:spaceId/permissions", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const body = updateSpacePermissionsSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { spaceId } = req.params;
    const { orgId } = req.tenant;

    const rows = await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.id, spaceId ?? ""), eq(spaces.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Space");

    await db
      .delete(spacePermissions)
      .where(eq(spacePermissions.spaceId, spaceId ?? ""));

    if (body.data.groupPermissions.length) {
      await db.insert(spacePermissions).values(
        body.data.groupPermissions.map((p) => ({
          spaceId: spaceId ?? "",
          groupId: p.groupId,
          accessLevel: p.accessLevel,
        })),
      );
    }

    await recordAudit(db, {
      orgId,
      actorId: req.tenant.userId,
      action: "space.permission_change",
      target: {
        spaceId,
        groupPermissions: body.data.groupPermissions,
        operation: "replace",
      },
      req,
    });

    res.json({ data: { spaceId, groupPermissions: body.data.groupPermissions } });
  });

  // DELETE /spaces/:spaceId
  router.delete("/spaces/:spaceId", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();
    const { spaceId } = req.params;

    const deleted = await db
      .delete(spaces)
      .where(and(eq(spaces.id, spaceId ?? ""), eq(spaces.orgId, req.tenant.orgId)))
      .returning();

    if (!deleted.length) throw new NotFoundError("Space");
    await recordAudit(db, {
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
      action: "space.delete",
      target: { spaceId, name: deleted[0]!.name },
      req,
    });
    res.json({ data: { deleted: true } });
  });

  return router;
}
