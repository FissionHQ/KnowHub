import { Router } from "express";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import { groups, groupMemberships, users } from "@wiki/db";
import { ValidationError, NotFoundError, ForbiddenError } from "../../lib/errors.js";
import type { Redis } from "ioredis";
import { invalidateGroupCache } from "../../middleware/tenantContext.js";
import { recordAudit } from "../../lib/audit.js";

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
});

export function createAccessRouter(db: Db, redis: Redis): Router {
  const router = Router();

  // GET /groups
  router.get("/groups", async (req, res) => {
    const rows = await db
      .select()
      .from(groups)
      .where(eq(groups.orgId, req.tenant.orgId));
    res.json({ data: rows });
  });

  // GET /groups/memberships — all group memberships with user details (admin only)
  router.get("/groups/memberships", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const rows = await db
      .select({
        groupId: groupMemberships.groupId,
        userId: groupMemberships.userId,
        userName: users.name,
        userEmail: users.email,
        userStatus: users.status,
      })
      .from(groupMemberships)
      .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
      .innerJoin(users, eq(groupMemberships.userId, users.id))
      .where(eq(groups.orgId, req.tenant.orgId));

    res.json({ data: rows });
  });

  // POST /groups
  router.post("/groups", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();
    const body = createGroupSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const inserted = await db
      .insert(groups)
      .values({
        id: uuidv4(),
        orgId: req.tenant.orgId,
        name: body.data.name,
        description: body.data.description ?? null,
      })
      .returning();
    await recordAudit(db, {
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
      action: "group.create",
      target: { groupId: inserted[0]!.id, name: body.data.name },
      req,
    });
    res.status(201).json({ data: inserted[0] });
  });

  // DELETE /groups/:groupId
  router.delete("/groups/:groupId", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();
    const { groupId } = req.params;
    const deleted = await db
      .delete(groups)
      .where(and(eq(groups.id, groupId ?? ""), eq(groups.orgId, req.tenant.orgId)))
      .returning();
    if (!deleted.length) throw new NotFoundError("Group");
    await recordAudit(db, {
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
      action: "group.delete",
      target: { groupId },
      req,
    });
    res.json({ data: { deleted: true } });
  });

  // POST /groups/:groupId/members
  router.post("/groups/:groupId/members", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();
    const body = addMembersSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { groupId } = req.params;

    const groupRows = await db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId ?? ""), eq(groups.orgId, req.tenant.orgId)));
    if (!groupRows.length) throw new NotFoundError("Group");

    await db.insert(groupMemberships).values(
      body.data.userIds.map((userId) => ({ userId, groupId: groupId ?? "" })),
    ).onConflictDoNothing();

    // Invalidate cache for all affected users
    await Promise.all(
      body.data.userIds.map((userId) =>
        invalidateGroupCache(redis, req.tenant.orgId, userId),
      ),
    );

    await recordAudit(db, {
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
      action: "group.member_add",
      target: { groupId, userIds: body.data.userIds },
      req,
    });

    res.json({ data: { added: body.data.userIds.length } });
  });

  // DELETE /groups/:groupId/members/:userId
  router.delete("/groups/:groupId/members/:userId", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();
    const { groupId, userId } = req.params;

    await db
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, groupId ?? ""),
          eq(groupMemberships.userId, userId ?? ""),
        ),
      );

    await invalidateGroupCache(redis, req.tenant.orgId, userId ?? "");
    await recordAudit(db, {
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
      action: "group.member_remove",
      target: { groupId, userId },
      req,
    });
    res.json({ data: { removed: true } });
  });

  return router;
}
