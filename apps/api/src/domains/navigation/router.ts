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
import type { AccessLevel } from "@wiki/types";

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
  router.get("/spaces", async (req, res) => {
    const { orgId, userRole, groupIds } = req.tenant;

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

  // POST /spaces
  router.post("/spaces", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const body = createSpaceSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const spaceId = uuidv4();
    const slug = await allocateSpaceSlug(db, req.tenant.orgId, body.data.name);
    const inserted = await db
      .insert(spaces)
      .values({
        id: spaceId,
        orgId: req.tenant.orgId,
        name: body.data.name,
        slug,
        description: body.data.description ?? null,
        iconEmoji: body.data.iconEmoji ?? null,
        createdBy: req.tenant.userId,
      })
      .returning();

    let groupPermissions = body.data.groupPermissions;
    if (!groupPermissions.length) {
      const defaultGroupId = await ensureDefaultGroup(db, req.tenant.orgId);
      groupPermissions = [{ groupId: defaultGroupId, accessLevel: "view" }];
    }

    await db.insert(spacePermissions).values(
      groupPermissions.map((p) => ({
        spaceId,
        groupId: p.groupId,
        accessLevel: p.accessLevel,
      })),
    );

    await recordAudit(db, {
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
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
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
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

  // GET /spaces/:spaceId/permissions — space group ACL (admin only)
  router.get("/spaces/:spaceId/permissions", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const { orgId } = req.tenant;
    const space = await requireSpace(orgId, req.params.spaceId ?? "");

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

  // PATCH /spaces/:spaceId/permissions — replace space group ACL (admin only)
  router.patch("/spaces/:spaceId/permissions", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();

    const body = updateSpacePermissionsSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId } = req.tenant;
    const space = await requireSpace(orgId, req.params.spaceId ?? "");

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
      actorId: req.tenant.userId,
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

  // DELETE /spaces/:spaceId
  router.delete("/spaces/:spaceId", async (req, res) => {
    if (req.tenant.userRole !== "admin") throw new ForbiddenError();
    const space = await requireSpace(req.tenant.orgId, req.params.spaceId ?? "");

    const deleted = await db
      .delete(spaces)
      .where(and(eq(spaces.id, space.id), eq(spaces.orgId, req.tenant.orgId)))
      .returning();

    if (!deleted.length) throw new NotFoundError("Space");
    await recordAudit(db, {
      orgId: req.tenant.orgId,
      actorId: req.tenant.userId,
      action: "space.delete",
      target: { spaceId: space.id, name: deleted[0]!.name, slug: deleted[0]!.slug },
      req,
    });
    res.json({ data: { deleted: true } });
  });

  return router;
}
