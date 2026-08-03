import { Router } from "express";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import {
  spaces,
  spacePermissions,
  groups,
  syncSpaceDocumentSearchIndex,
  allocateSpaceSlug,
  findSpaceByRef,
} from "@wiki/db";
import { ValidationError, NotFoundError, ForbiddenError } from "../../lib/errors.js";
import { resolveSpaceAccess } from "../access/permissionResolver.js";
import { recordAudit } from "../../lib/audit.js";
import { logger } from "../../lib/logger.js";
import { ensureDefaultGroup } from "../access/defaultGroup.js";
import {
  spaceCreatorGroupIds,
  userCanCreateSpaces,
  userCanManageGroups,
} from "../access/groupCapabilities.js";
import type { AccessLevel, UserRole } from "@wiki/types";

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

const grantSpacePermissionSchema = z.object({
  groupId: z.string().uuid(),
  accessLevel: z.enum(["view", "edit"]),
});

/** Admin or the user who created the space may fully manage its group ACL. */
function canManageSpaceAcl(
  space: { createdBy: string },
  userRole: UserRole,
  userId: string,
): boolean {
  return userRole === "admin" || space.createdBy === userId;
}

export function createNavigationRouter(db: Db): Router {
  const router = Router();

  async function reindexSpaceDocuments(orgId: string, spaceId: string) {
    try {
      await syncSpaceDocumentSearchIndex(db, orgId, spaceId);
    } catch (err) {
      logger.warn("Failed to reindex space documents for search", { err, orgId, spaceId });
    }
  }

  async function requireSpace(orgId: string, ref: string) {
    const space = await findSpaceByRef(db, orgId, ref);
    if (!space) throw new NotFoundError("Space");
    return space;
  }

  // GET /spaces — list spaces visible to current user
  // ?scope=owned — admin: all org spaces; others: spaces they created
  router.get("/spaces", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const scope = typeof req.query["scope"] === "string" ? req.query["scope"] : undefined;

    if (scope === "owned") {
      const rows =
        userRole === "admin"
          ? await db.select().from(spaces).where(eq(spaces.orgId, orgId))
          : await db
              .select()
              .from(spaces)
              .where(and(eq(spaces.orgId, orgId), eq(spaces.createdBy, userId)));
      return res.json({
        data: rows.map((row) => ({ ...row, accessLevel: "edit" as AccessLevel })),
      });
    }

    if (userRole === "admin") {
      const rows = await db
        .select()
        .from(spaces)
        .where(eq(spaces.orgId, orgId));
      return res.json({
        data: rows.map((row) => ({ ...row, accessLevel: "edit" as AccessLevel })),
      });
    }

    if (!groupIds.length) return res.json({ data: [] });

    const accessible = await db
      .select({
        spaceId: spacePermissions.spaceId,
        accessLevel: spacePermissions.accessLevel,
      })
      .from(spacePermissions)
      .where(inArray(spacePermissions.groupId, groupIds));

    const levelBySpace = new Map<string, AccessLevel>();
    for (const row of accessible) {
      const prev = levelBySpace.get(row.spaceId);
      if (!prev || (row.accessLevel === "edit" && prev === "view")) {
        levelBySpace.set(row.spaceId, row.accessLevel);
      }
    }

    const spaceIds = [...levelBySpace.keys()];
    if (!spaceIds.length) return res.json({ data: [] });

    const rows = await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.orgId, orgId), inArray(spaces.id, spaceIds)));

    const capView = userRole === "viewer";
    res.json({
      data: rows.map((row) => ({
        ...row,
        accessLevel: (capView ? "view" : levelBySpace.get(row.id) ?? "view") as AccessLevel,
      })),
    });
  });

  // POST /spaces — admins, or members of a group with canCreateSpaces
  router.post("/spaces", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const allowed = await userCanCreateSpaces(db, { orgId, userRole, groupIds });
    if (!allowed) throw new ForbiddenError("You do not have permission to create spaces");

    const body = createSpaceSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    // Non-admins may only assign ACL to groups they belong to.
    if (userRole !== "admin" && body.data.groupPermissions.length) {
      const allowedGroupIds = new Set(groupIds);
      const invalid = body.data.groupPermissions.some((p) => !allowedGroupIds.has(p.groupId));
      if (invalid) {
        throw new ForbiddenError("You can only grant access to groups you belong to");
      }
    }

    if (body.data.groupPermissions.length) {
      const orgGroupIds = await db
        .select({ id: groups.id })
        .from(groups)
        .where(
          and(
            eq(groups.orgId, orgId),
            inArray(
              groups.id,
              body.data.groupPermissions.map((p) => p.groupId),
            ),
          ),
        );
      if (orgGroupIds.length !== body.data.groupPermissions.length) {
        throw new ValidationError("One or more groups were not found in this organization");
      }
    }

    const spaceId = uuidv4();
    const slug = await allocateSpaceSlug(db, orgId, body.data.name);
    const inserted = await db
      .insert(spaces)
      .values({
        id: spaceId,
        orgId,
        name: body.data.name,
        slug,
        description: body.data.description ?? null,
        iconEmoji: body.data.iconEmoji ?? null,
        createdBy: userId,
      })
      .returning();

    let groupPermissions = body.data.groupPermissions;
    if (!groupPermissions.length) {
      const defaultGroupId = await ensureDefaultGroup(db, orgId);
      groupPermissions = [{ groupId: defaultGroupId, accessLevel: "view" }];
      // Ensure non-admin creators retain edit access via a capable group they belong to.
      if (userRole !== "admin") {
        const creatorGroups = await spaceCreatorGroupIds(db, { orgId, groupIds });
        const editGroupId = creatorGroups[0];
        if (editGroupId && editGroupId !== defaultGroupId) {
          groupPermissions.push({ groupId: editGroupId, accessLevel: "edit" });
        } else if (editGroupId === defaultGroupId) {
          groupPermissions = [{ groupId: defaultGroupId, accessLevel: "edit" }];
        }
      }
    }

    await db.insert(spacePermissions).values(
      groupPermissions.map((p) => ({
        spaceId,
        groupId: p.groupId,
        accessLevel: p.accessLevel,
      })),
    );

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "space.create",
      target: {
        spaceId,
        name: body.data.name,
        slug,
        groupPermissions,
      },
      req,
    });

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "space.permission_change",
      target: {
        spaceId,
        groupPermissions,
        operation: "initial",
      },
      req,
    });

    res.status(201).json({
      data: { ...inserted[0], accessLevel: "edit" as AccessLevel },
    });
  });

  // GET /spaces/:spaceId — spaceId may be UUID or slug
  router.get("/spaces/:spaceId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const ref = req.params.spaceId ?? "";

    const space = await requireSpace(orgId, ref);

    const accessLevel = await resolveSpaceAccess({
      db,
      userRole,
      userId,
      groupIds,
      spaceId: space.id,
    });

    res.json({ data: { ...space, accessLevel } });
  });

  // GET /spaces/:spaceId/permissions — admin or space creator
  router.get("/spaces/:spaceId/permissions", async (req, res) => {
    const { orgId, userRole, userId } = req.tenant;
    const space = await requireSpace(orgId, req.params.spaceId ?? "");

    if (!canManageSpaceAcl(space, userRole, userId)) {
      throw new ForbiddenError("Only the space creator or an admin can view space permissions");
    }

    const perms = await db
      .select({
        groupId: spacePermissions.groupId,
        groupName: groups.name,
        accessLevel: spacePermissions.accessLevel,
      })
      .from(spacePermissions)
      .innerJoin(groups, eq(spacePermissions.groupId, groups.id))
      .where(eq(spacePermissions.spaceId, space.id));

    res.json({ data: perms });
  });

  // PATCH /spaces/:spaceId/permissions — replace full ACL (admin or space creator)
  router.patch("/spaces/:spaceId/permissions", async (req, res) => {
    const { orgId, userRole, userId } = req.tenant;
    const body = updateSpacePermissionsSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const space = await requireSpace(orgId, req.params.spaceId ?? "");
    if (!canManageSpaceAcl(space, userRole, userId)) {
      throw new ForbiddenError("Only the space creator or an admin can update space permissions");
    }

    if (body.data.groupPermissions.length) {
      const orgGroupIds = await db
        .select({ id: groups.id })
        .from(groups)
        .where(
          and(
            eq(groups.orgId, orgId),
            inArray(
              groups.id,
              body.data.groupPermissions.map((p) => p.groupId),
            ),
          ),
        );
      if (orgGroupIds.length !== new Set(body.data.groupPermissions.map((p) => p.groupId)).size) {
        throw new ValidationError("One or more groups were not found in this organization");
      }
    }

    await db
      .delete(spacePermissions)
      .where(eq(spacePermissions.spaceId, space.id));

    if (body.data.groupPermissions.length) {
      await db.insert(spacePermissions).values(
        body.data.groupPermissions.map((p) => ({
          spaceId: space.id,
          groupId: p.groupId,
          accessLevel: p.accessLevel,
        })),
      );
    }

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "space.permission_change",
      target: {
        spaceId: space.id,
        groupPermissions: body.data.groupPermissions,
        operation: "replace",
      },
      req,
    });

    await reindexSpaceDocuments(orgId, space.id);

    res.json({ data: { spaceId: space.id, groupPermissions: body.data.groupPermissions } });
  });

  // POST /spaces/:spaceId/permissions/grant — add/update one group on a space ACL
  router.post("/spaces/:spaceId/permissions/grant", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const body = grantSpacePermissionSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const space = await requireSpace(orgId, req.params.spaceId ?? "");
    const isAclManager = canManageSpaceAcl(space, userRole, userId);

    if (!isAclManager) {
      // Group managers may still grant groups they created, if they can edit the space.
      const canManage = await userCanManageGroups(db, { orgId, userRole, groupIds });
      if (!canManage) {
        throw new ForbiddenError("You do not have permission to grant space access");
      }
      const accessLevel = await resolveSpaceAccess({
        db, userRole, userId, groupIds, spaceId: space.id,
      });
      if (accessLevel !== "edit") {
        throw new ForbiddenError("You need edit access on this space to grant access");
      }
    }

    const targetGroup = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, body.data.groupId), eq(groups.orgId, orgId)))
      .limit(1);
    if (!targetGroup.length) throw new NotFoundError("Group");

    // Non–ACL-managers may only grant groups they created.
    if (!isAclManager && targetGroup[0]!.createdBy !== userId) {
      throw new ForbiddenError("You can only grant access to groups you created");
    }

    await db
      .insert(spacePermissions)
      .values({
        spaceId: space.id,
        groupId: body.data.groupId,
        accessLevel: body.data.accessLevel,
      })
      .onConflictDoUpdate({
        target: [spacePermissions.spaceId, spacePermissions.groupId],
        set: { accessLevel: body.data.accessLevel },
      });

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "space.permission_change",
      target: {
        spaceId: space.id,
        groupId: body.data.groupId,
        accessLevel: body.data.accessLevel,
        operation: "grant",
      },
      req,
    });

    await reindexSpaceDocuments(orgId, space.id);

    res.json({
      data: {
        spaceId: space.id,
        groupId: body.data.groupId,
        accessLevel: body.data.accessLevel,
      },
    });
  });

  // DELETE /spaces/:spaceId/permissions/:groupId — revoke one group's access
  router.delete("/spaces/:spaceId/permissions/:groupId", async (req, res) => {
    const { orgId, userRole, userId } = req.tenant;
    const space = await requireSpace(orgId, req.params.spaceId ?? "");
    if (!canManageSpaceAcl(space, userRole, userId)) {
      throw new ForbiddenError("Only the space creator or an admin can revoke space access");
    }

    const groupId = req.params.groupId ?? "";
    const deleted = await db
      .delete(spacePermissions)
      .where(
        and(
          eq(spacePermissions.spaceId, space.id),
          eq(spacePermissions.groupId, groupId),
        ),
      )
      .returning();

    if (!deleted.length) throw new NotFoundError("Space permission");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "space.permission_change",
      target: {
        spaceId: space.id,
        groupId,
        operation: "revoke",
      },
      req,
    });

    await reindexSpaceDocuments(orgId, space.id);

    res.json({ data: { removed: true, spaceId: space.id, groupId } });
  });

  // DELETE /spaces/:spaceId — admin or the space creator
  router.delete("/spaces/:spaceId", async (req, res) => {
    const { orgId, userRole, userId } = req.tenant;
    const space = await requireSpace(orgId, req.params.spaceId ?? "");
    if (!canManageSpaceAcl(space, userRole, userId)) {
      throw new ForbiddenError("Only the space creator or an admin can delete this space");
    }

    const deleted = await db
      .delete(spaces)
      .where(and(eq(spaces.id, space.id), eq(spaces.orgId, orgId)))
      .returning();

    if (!deleted.length) throw new NotFoundError("Space");
    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "space.delete",
      target: { spaceId: space.id, name: deleted[0]!.name, slug: deleted[0]!.slug },
      req,
    });
    res.json({ data: { deleted: true } });
  });

  return router;
}
