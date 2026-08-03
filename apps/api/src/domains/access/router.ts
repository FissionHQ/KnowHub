import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import { groups, groupMemberships, users } from "@wiki/db";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../../lib/errors.js";
import type { Redis } from "ioredis";
import { invalidateGroupCache } from "../../middleware/tenantContext.js";
import { recordAudit } from "../../lib/audit.js";
import { isDefaultGroup } from "./defaultGroup.js";
import {
  manageGroupForbiddenMessage,
  userCanManageGroup,
  userCanManageGroups,
} from "./groupCapabilities.js";

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  canCreateSpaces: z.boolean().optional(),
  canManageGroups: z.boolean().optional(),
});

const updateGroupSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    canCreateSpaces: z.boolean().optional(),
    canManageGroups: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.canCreateSpaces !== undefined ||
      v.canManageGroups !== undefined,
    { message: "Provide at least one field to update" },
  );

const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
});

export function createAccessRouter(db: Db, redis: Redis): Router {
  const router = Router();

  // GET /groups
  // ?scope=manageable — admin: all groups; others with canManageGroups: only groups they created
  router.get("/groups", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const scope = typeof req.query["scope"] === "string" ? req.query["scope"] : undefined;

    if (scope === "manageable") {
      const canManage = await userCanManageGroups(db, { orgId, userRole, groupIds });
      if (userRole !== "admin" && !canManage) throw new ForbiddenError();

      if (userRole === "admin") {
        const rows = await db.select().from(groups).where(eq(groups.orgId, orgId));
        res.json({ data: rows });
        return;
      }

      const rows = await db
        .select()
        .from(groups)
        .where(
          and(
            eq(groups.orgId, orgId),
            eq(groups.createdBy, userId),
            eq(groups.isDefault, false),
          ),
        );
      res.json({ data: rows });
      return;
    }

    const rows = await db
      .select()
      .from(groups)
      .where(eq(groups.orgId, orgId));
    res.json({ data: rows });
  });

  // GET /groups/memberships — admin, or group managers (for groups they created)
  router.get("/groups/memberships", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const canManage = await userCanManageGroups(db, { orgId, userRole, groupIds });
    if (userRole !== "admin" && !canManage) throw new ForbiddenError();

    const rows = await db
      .select({
        groupId: groupMemberships.groupId,
        userId: groupMemberships.userId,
        userName: users.name,
        userEmail: users.email,
        userStatus: users.status,
        groupCreatedBy: groups.createdBy,
      })
      .from(groupMemberships)
      .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
      .innerJoin(users, eq(groupMemberships.userId, users.id))
      .where(eq(groups.orgId, orgId));

    const data =
      userRole === "admin"
        ? rows.map(({ groupCreatedBy: _c, ...rest }) => rest)
        : rows
            .filter((r) => r.groupCreatedBy === userId)
            .map(({ groupCreatedBy: _c, ...rest }) => rest);

    res.json({ data });
  });

  // POST /groups — admin, or users with canManageGroups
  router.post("/groups", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const canManage = await userCanManageGroups(db, { orgId, userRole, groupIds });
    if (userRole !== "admin" && !canManage) {
      throw new ForbiddenError("You do not have permission to create groups");
    }

    const body = createGroupSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    // Only admins may grant privileged capabilities on groups.
    const canCreateSpaces =
      userRole === "admin" ? (body.data.canCreateSpaces ?? false) : false;
    const canManageGroupsFlag =
      userRole === "admin" ? (body.data.canManageGroups ?? false) : false;

    const groupId = uuidv4();
    let inserted;
    try {
      inserted = await db
        .insert(groups)
        .values({
          id: groupId,
          orgId,
          name: body.data.name,
          description: body.data.description ?? null,
          canCreateSpaces,
          canManageGroups: canManageGroupsFlag,
          createdBy: userId,
        })
        .returning();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "23505") {
        throw new ConflictError(`A group named "${body.data.name}" already exists`);
      }
      throw err;
    }

    // Creator joins the new group so they can use it immediately.
    await db
      .insert(groupMemberships)
      .values({ userId, groupId })
      .onConflictDoNothing();
    await invalidateGroupCache(redis, orgId, userId);

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "group.create",
      target: {
        groupId,
        name: body.data.name,
        canCreateSpaces,
        canManageGroups: canManageGroupsFlag,
      },
      req,
    });
    res.status(201).json({ data: inserted[0] });
  });

  // PATCH /groups/:groupId
  router.patch("/groups/:groupId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const body = updateGroupSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { groupId } = req.params;
    const { allowed, group, reason } = await userCanManageGroup(db, {
      orgId,
      userId,
      userRole,
      groupIds,
      groupId: groupId ?? "",
    });
    if (!group) throw new NotFoundError("Group");
    if (!allowed) throw new ForbiddenError(manageGroupForbiddenMessage(reason));

    // Capability flags are admin-only.
    if (
      userRole !== "admin" &&
      (body.data.canCreateSpaces !== undefined || body.data.canManageGroups !== undefined)
    ) {
      throw new ForbiddenError("Only admins can change group capabilities");
    }

    const updates: {
      name?: string;
      description?: string | null;
      canCreateSpaces?: boolean;
      canManageGroups?: boolean;
    } = {};
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.description !== undefined) updates.description = body.data.description;
    if (body.data.canCreateSpaces !== undefined) {
      updates.canCreateSpaces = body.data.canCreateSpaces;
    }
    if (body.data.canManageGroups !== undefined) {
      updates.canManageGroups = body.data.canManageGroups;
    }

    const updated = await db
      .update(groups)
      .set(updates)
      .where(and(eq(groups.id, groupId ?? ""), eq(groups.orgId, orgId)))
      .returning();
    if (!updated.length) throw new NotFoundError("Group");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "group.update",
      target: { groupId, ...updates },
      req,
    });
    res.json({ data: updated[0] });
  });

  // DELETE /groups/:groupId
  router.delete("/groups/:groupId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { groupId } = req.params;

    if (await isDefaultGroup(db, orgId, groupId ?? "")) {
      throw new ForbiddenError("Cannot delete the default group");
    }

    const { allowed, group, reason } = await userCanManageGroup(db, {
      orgId,
      userId,
      userRole,
      groupIds,
      groupId: groupId ?? "",
    });
    if (!group) throw new NotFoundError("Group");
    if (!allowed) throw new ForbiddenError(manageGroupForbiddenMessage(reason));

    const deleted = await db
      .delete(groups)
      .where(and(eq(groups.id, groupId ?? ""), eq(groups.orgId, orgId)))
      .returning();
    if (!deleted.length) throw new NotFoundError("Group");
    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "group.delete",
      target: { groupId },
      req,
    });
    res.json({ data: { deleted: true } });
  });

  // POST /groups/:groupId/members
  router.post("/groups/:groupId/members", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const body = addMembersSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { groupId } = req.params;
    const { allowed, group, reason } = await userCanManageGroup(db, {
      orgId,
      userId,
      userRole,
      groupIds,
      groupId: groupId ?? "",
    });
    if (!group) throw new NotFoundError("Group");
    if (!allowed) throw new ForbiddenError(manageGroupForbiddenMessage(reason));

    await db.insert(groupMemberships).values(
      body.data.userIds.map((memberId) => ({ userId: memberId, groupId: groupId ?? "" })),
    ).onConflictDoNothing();

    await Promise.all(
      body.data.userIds.map((memberId) =>
        invalidateGroupCache(redis, orgId, memberId),
      ),
    );

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "group.member_add",
      target: { groupId, userIds: body.data.userIds },
      req,
    });

    res.json({ data: { added: body.data.userIds.length } });
  });

  // DELETE /groups/:groupId/members/:userId
  router.delete("/groups/:groupId/members/:userId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { groupId, userId: memberId } = req.params;

    if (await isDefaultGroup(db, orgId, groupId ?? "")) {
      throw new ForbiddenError("Cannot remove users from the default group");
    }

    const { allowed, group, reason } = await userCanManageGroup(db, {
      orgId,
      userId,
      userRole,
      groupIds,
      groupId: groupId ?? "",
    });
    if (!group) throw new NotFoundError("Group");
    if (!allowed) throw new ForbiddenError(manageGroupForbiddenMessage(reason));

    await db
      .delete(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, groupId ?? ""),
          eq(groupMemberships.userId, memberId ?? ""),
        ),
      );

    await invalidateGroupCache(redis, orgId, memberId ?? "");
    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "group.member_remove",
      target: { groupId, userId: memberId },
      req,
    });
    res.json({ data: { removed: true } });
  });

  return router;
}
