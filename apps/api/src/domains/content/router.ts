import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, ne } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import {
  documents,
  documentVersions,
  documentCollabState,
  documentPermissions,
  spacePermissions,
  groups,
  users,
  spaces,
  organizations,
  setTenantContext,
  isWithinTrashRetention,
  trashPurgeAt,
} from "@wiki/db";
import { encodeHtmlAsYjsStateBase64 } from "@wiki/doc-collab";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../../lib/errors.js";
import { assertDocumentAccess, assertSpaceAccess, resolveDocumentAccess, assertCanManageDocumentPermissions, assertCanMutateDocumentContent } from "../access/permissionResolver.js";
import { recordAudit } from "../../lib/audit.js";
import { notifyCollabDocumentReset } from "../../lib/collabReset.js";
import { logger } from "../../lib/logger.js";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { SearchIndexMessage } from "@wiki/types";
import type { Redis } from "ioredis";

const createDocSchema = z.object({
  spaceId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  content: z.string().default(""),
  tags: z.array(z.string()).default([]),
});

const updateDocSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "published"]).optional(),
  restrictDownload: z.boolean().optional(),
});

const setPermissionSchema = z
  .object({
    groupId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    accessLevel: z.enum(["view", "edit"]),
  })
  .refine((d) => Boolean(d.groupId) !== Boolean(d.userId), {
    message: "Exactly one of groupId or userId is required",
  });

const updatePermissionSchema = z.object({
  accessLevel: z.enum(["view", "edit"]),
});

type RestorableDocumentStatus = "draft" | "published";

function restorableStatus(status: string): RestorableDocumentStatus {
  return status === "published" ? "published" : "draft";
}

export function createContentRouter(
  db: Db,
  sqs: SQSClient,
  indexQueueUrl: string,
  redis: Redis,
): Router {
  const router = Router();

  async function enqueueIndex(documentId: string, orgId: string, operation: "upsert" | "delete") {
    const msg: SearchIndexMessage = { type: "SEARCH_INDEX", documentId, orgId, operation };
    try {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: indexQueueUrl,
          MessageBody: JSON.stringify(msg),
        }),
      );
    } catch (err) {
      logger.warn("Failed to enqueue search index message", { err, documentId, orgId, operation });
    }
  }

  // GET /spaces/:spaceId/documents
  router.get("/spaces/:spaceId/documents", async (req, res) => {
    const { userRole, userId, groupIds } = req.tenant;
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
      .select({
        id: documents.id,
        orgId: documents.orgId,
        spaceId: documents.spaceId,
        parentId: documents.parentId,
        type: documents.type,
        title: documents.title,
        contentRef: documents.contentRef,
        ownerId: documents.ownerId,
        ownerName: users.name,
        status: documents.status,
        version: documents.version,
        tags: documents.tags,
        restrictDownload: documents.restrictDownload,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .leftJoin(users, eq(documents.ownerId, users.id))
      .where(
        and(
          eq(documents.spaceId, spaceId ?? ""),
          eq(documents.orgId, req.tenant.orgId),
          ne(documents.status, "trashed"),
        ),
      );
    res.json({ data: rows });
  });

  // GET /documents/recent — recently updated documents
  router.get("/documents/recent", async (req, res) => {
    const { orgId } = req.tenant;

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, orgId), ne(documents.status, "trashed")))
      .orderBy(desc(documents.updatedAt))
      .limit(20);

    res.json({ data: rows });
  });

  // GET /trash — list trashed documents (admin only)
  router.get("/trash", async (req, res) => {
    const { orgId, userRole } = req.tenant;
    if (userRole !== "admin") throw new ForbiddenError();

    const orgRows = await db
      .select({ trashRetentionDays: organizations.trashRetentionDays })
      .from(organizations)
      .where(eq(organizations.id, orgId));

    const retentionDays = orgRows[0]?.trashRetentionDays ?? 30;

    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        spaceId: documents.spaceId,
        spaceName: spaces.name,
        ownerId: documents.ownerId,
        trashedAt: documents.trashedAt,
        statusBeforeTrash: documents.statusBeforeTrash,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .innerJoin(spaces, eq(documents.spaceId, spaces.id))
      .where(and(eq(documents.orgId, orgId), eq(documents.status, "trashed")))
      .orderBy(desc(documents.trashedAt));

    res.json({
      data: rows
        .map((row) => {
          const trashedAt = row.trashedAt ?? row.updatedAt;
          return {
            id: row.id,
            title: row.title,
            type: row.type,
            spaceId: row.spaceId,
            spaceName: row.spaceName,
            ownerId: row.ownerId,
            trashedAt,
            purgeAt: trashPurgeAt(trashedAt, retentionDays),
            previousStatus: restorableStatus(row.statusBeforeTrash ?? "draft"),
          };
        })
        .filter((row) => isWithinTrashRetention(row.trashedAt, retentionDays)),
    });
  });

  // POST /documents
  router.post("/documents", async (req, res) => {
    const body = createDocSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId, userRole, userId, groupIds } = req.tenant;

    await assertSpaceAccess({
      db,
      userRole,
      userId,
      groupIds,
      spaceId: body.data.spaceId,
      required: "edit",
    });

    const docId = uuidv4();
    const inserted = await db
      .insert(documents)
      .values({
        id: docId,
        orgId,
        spaceId: body.data.spaceId,
        parentId: body.data.parentId ?? null,
        type: "page",
        title: body.data.title,
        contentRef: body.data.content,
        ownerId: userId,
        status: "draft",
        version: 1,
        tags: body.data.tags,
      })
      .returning();

    // Save initial version
    await db.insert(documentVersions).values({
      id: uuidv4(),
      documentId: docId,
      versionNumber: 1,
      contentSnapshot: body.data.content,
      editedBy: userId,
    });

    await enqueueIndex(docId, orgId, "upsert");

    res.status(201).json({ data: inserted[0] });
  });

  // GET /documents/:documentId
  router.get("/documents/:documentId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;

    const rows = await db
      .select({
        id: documents.id,
        orgId: documents.orgId,
        spaceId: documents.spaceId,
        parentId: documents.parentId,
        type: documents.type,
        title: documents.title,
        contentRef: documents.contentRef,
        ownerId: documents.ownerId,
        ownerName: users.name,
        status: documents.status,
        version: documents.version,
        tags: documents.tags,
        restrictDownload: documents.restrictDownload,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .leftJoin(users, eq(documents.ownerId, users.id))
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Document");
    const doc = rows[0]!;

    if (doc.status === "trashed" && userRole !== "admin") {
      throw new NotFoundError("Document");
    }

    await assertDocumentAccess({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    const accessLevel = await resolveDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
    });

    res.json({ data: { ...doc, accessLevel } });
  });

  // PATCH /documents/:documentId
  router.patch("/documents/:documentId", async (req, res) => {
    const body = updateDocSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Document");
    const doc = rows[0]!;

    if (doc.status === "trashed") {
      throw new ConflictError("Document is in trash");
    }

    await assertCanMutateDocumentContent({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      ownerId: doc.ownerId,
    });

    const newVersion = doc.version + 1;

    const updated = await db
      .update(documents)
      .set({
        ...(body.data.title !== undefined ? { title: body.data.title } : {}),
        ...(body.data.content !== undefined ? { contentRef: body.data.content } : {}),
        ...(body.data.tags !== undefined ? { tags: body.data.tags } : {}),
        ...(body.data.status !== undefined ? { status: body.data.status } : {}),
        ...(body.data.restrictDownload !== undefined ? { restrictDownload: body.data.restrictDownload } : {}),
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)))
      .returning();

    // Save version snapshot when content changes
    if (body.data.content !== undefined) {
      await db.insert(documentVersions).values({
        id: uuidv4(),
        documentId: documentId ?? "",
        versionNumber: newVersion,
        contentSnapshot: body.data.content,
        editedBy: userId,
      });
    }

    await enqueueIndex(documentId ?? "", orgId, "upsert");

    res.json({ data: updated[0] });
  });

  // DELETE /documents/:documentId — soft delete (trash)
  router.delete("/documents/:documentId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Document");
    const doc = rows[0]!;

    if (doc.status === "trashed") {
      throw new ConflictError("Document is already in trash");
    }

    await assertCanMutateDocumentContent({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      ownerId: doc.ownerId,
    });

    const previousStatus = restorableStatus(doc.status);
    const trashedAt = new Date();
    await db
      .update(documents)
      .set({
        status: "trashed",
        statusBeforeTrash: previousStatus,
        trashedAt,
        updatedAt: trashedAt,
      })
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    await enqueueIndex(documentId ?? "", orgId, "delete");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.delete",
      target: {
        documentId,
        title: doc.title,
        spaceId: doc.spaceId,
        previousStatus,
      },
      req,
    });

    res.json({ data: { trashed: true } });
  });

  // POST /documents/:documentId/restore — restore from trash (admin only)
  router.post("/documents/:documentId/restore", async (req, res) => {
    const { orgId, userRole, userId } = req.tenant;
    const { documentId } = req.params;

    if (userRole !== "admin") throw new ForbiddenError();

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Document");
    const doc = rows[0]!;

    if (doc.status !== "trashed") {
      throw new ConflictError("Document is not in trash");
    }

    const orgRows = await db
      .select({ trashRetentionDays: organizations.trashRetentionDays })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const retentionDays = orgRows[0]?.trashRetentionDays ?? 30;
    const trashedAt = doc.trashedAt ?? doc.updatedAt;

    if (!isWithinTrashRetention(trashedAt, retentionDays)) {
      throw new ConflictError("Document has exceeded the trash retention period");
    }

    const restoredStatus = restorableStatus(doc.statusBeforeTrash ?? "draft");

    const restored = await db
      .update(documents)
      .set({
        status: restoredStatus,
        statusBeforeTrash: null,
        trashedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)))
      .returning();

    await enqueueIndex(documentId ?? "", orgId, "upsert");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.restore",
      target: {
        documentId,
        title: doc.title,
        spaceId: doc.spaceId,
        restoredStatus,
      },
      req,
    });

    res.json({ data: restored[0] });
  });

  // GET /documents/:documentId/versions
  router.get("/documents/:documentId/versions", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Document");
    const doc = rows[0]!;

    await assertDocumentAccess({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    const versions = await db
      .select({
        id: documentVersions.id,
        documentId: documentVersions.documentId,
        versionNumber: documentVersions.versionNumber,
        contentSnapshot: documentVersions.contentSnapshot,
        editedBy: documentVersions.editedBy,
        editedAt: documentVersions.editedAt,
        editorName: users.name,
      })
      .from(documentVersions)
      .leftJoin(users, eq(documentVersions.editedBy, users.id))
      .where(eq(documentVersions.documentId, documentId ?? ""))
      .orderBy(desc(documentVersions.versionNumber));

    res.json({ data: versions });
  });

  async function loadDocument(orgId: string, documentId: string) {
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));
    if (!rows.length) throw new NotFoundError("Document");
    return rows[0]!;
  }

  async function resetCollabStateAfterContentChange(
    orgId: string,
    documentId: string,
    html: string,
  ): Promise<void> {
    await setTenantContext(db, orgId);
    const state = encodeHtmlAsYjsStateBase64(html);
    await db
      .insert(documentCollabState)
      .values({ documentId, orgId, state, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: documentCollabState.documentId,
        set: { state, updatedAt: new Date() },
      });
    await notifyCollabDocumentReset(redis, orgId, documentId);
  }

  // POST /documents/:documentId/versions/:versionNumber/restore
  router.post("/documents/:documentId/versions/:versionNumber/restore", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId, versionNumber: versionNumberRaw } = req.params;

    const versionNumber = Number(versionNumberRaw);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      throw new NotFoundError("Version");
    }

    const doc = await loadDocument(orgId, documentId ?? "");

    if (doc.status === "trashed") {
      throw new ConflictError("Document is in trash");
    }

    await assertCanMutateDocumentContent({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      ownerId: doc.ownerId,
    });

    if (versionNumber === doc.version) {
      throw new ConflictError("Cannot restore the current version");
    }

    const versionRows = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, documentId ?? ""),
          eq(documentVersions.versionNumber, versionNumber),
        ),
      );

    if (!versionRows.length) throw new NotFoundError("Version");

    const restoredContent = versionRows[0]!.contentSnapshot;
    const newVersion = doc.version + 1;

    const updated = await db
      .update(documents)
      .set({
        contentRef: restoredContent,
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)))
      .returning();

    await db.insert(documentVersions).values({
      id: uuidv4(),
      documentId: documentId ?? "",
      versionNumber: newVersion,
      contentSnapshot: restoredContent,
      editedBy: userId,
    });

    if (doc.type === "page") {
      await resetCollabStateAfterContentChange(orgId, documentId ?? "", restoredContent);
    }

    await enqueueIndex(documentId ?? "", orgId, "upsert");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.version_restore",
      target: {
        documentId,
        fromVersion: versionNumber,
        toVersion: newVersion,
        title: doc.title,
        spaceId: doc.spaceId,
      },
      req,
    });

    res.json({ data: updated[0], reloadRequired: true });
  });

  // GET /documents/:documentId/permissions
  router.get("/documents/:documentId/permissions", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;
    const doc = await loadDocument(orgId, documentId ?? "");

    await assertDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });
    assertCanManageDocumentPermissions({ userRole, userId, ownerId: doc.ownerId });

    const overrides = await db
      .select({
        id: documentPermissions.id,
        documentId: documentPermissions.documentId,
        groupId: documentPermissions.groupId,
        userId: documentPermissions.userId,
        accessLevel: documentPermissions.accessLevel,
        groupName: groups.name,
        userName: users.name,
        userEmail: users.email,
      })
      .from(documentPermissions)
      .leftJoin(groups, eq(documentPermissions.groupId, groups.id))
      .leftJoin(users, eq(documentPermissions.userId, users.id))
      .where(eq(documentPermissions.documentId, documentId ?? ""));

    const inherited = await db
      .select({
        groupId: spacePermissions.groupId,
        groupName: groups.name,
        accessLevel: spacePermissions.accessLevel,
      })
      .from(spacePermissions)
      .innerJoin(groups, eq(spacePermissions.groupId, groups.id))
      .where(eq(spacePermissions.spaceId, doc.spaceId));

    res.json({
      data: {
        overrides: overrides.map((row) => ({
          id: row.id,
          documentId: row.documentId,
          groupId: row.groupId ?? undefined,
          userId: row.userId ?? undefined,
          accessLevel: row.accessLevel,
          groupName: row.groupName ?? undefined,
          userName: row.userName ?? undefined,
          userEmail: row.userEmail ?? undefined,
        })),
        inherited: inherited.map((row) => ({
          groupId: row.groupId,
          groupName: row.groupName,
          accessLevel: row.accessLevel,
        })),
      },
    });
  });

  // POST /documents/:documentId/permissions
  router.post("/documents/:documentId/permissions", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;
    const body = setPermissionSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const doc = await loadDocument(orgId, documentId ?? "");
    assertCanManageDocumentPermissions({ userRole, userId, ownerId: doc.ownerId });
    await assertDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    if (body.data.groupId) {
      const groupRows = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.id, body.data.groupId), eq(groups.orgId, orgId)));
      if (!groupRows.length) throw new NotFoundError("Group");
    } else if (body.data.userId) {
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, body.data.userId), eq(users.orgId, orgId)));
      if (!userRows.length) throw new NotFoundError("User");
    }

    const existing = await db
      .select()
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.documentId, documentId ?? ""),
          body.data.groupId
            ? eq(documentPermissions.groupId, body.data.groupId)
            : eq(documentPermissions.userId, body.data.userId!),
        ),
      );

    let permissionId: string;
    if (existing.length) {
      permissionId = existing[0]!.id;
      await db
        .update(documentPermissions)
        .set({ accessLevel: body.data.accessLevel })
        .where(eq(documentPermissions.id, permissionId));
    } else {
      permissionId = uuidv4();
      await db.insert(documentPermissions).values({
        id: permissionId,
        documentId: documentId ?? "",
        groupId: body.data.groupId ?? null,
        userId: body.data.userId ?? null,
        accessLevel: body.data.accessLevel,
      });
    }

    await enqueueIndex(documentId ?? "", orgId, "upsert");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.permission_change",
      target: {
        documentId,
        permissionId,
        groupId: body.data.groupId,
        userId: body.data.userId,
        accessLevel: body.data.accessLevel,
        operation: existing.length ? "update" : "add",
      },
      req,
    });

    res.status(existing.length ? 200 : 201).json({
      data: {
        id: permissionId,
        documentId: documentId ?? "",
        groupId: body.data.groupId,
        userId: body.data.userId,
        accessLevel: body.data.accessLevel,
      },
    });
  });

  // PATCH /documents/:documentId/permissions/:permissionId
  router.patch("/documents/:documentId/permissions/:permissionId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId, permissionId } = req.params;
    const body = updatePermissionSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const doc = await loadDocument(orgId, documentId ?? "");
    assertCanManageDocumentPermissions({ userRole, userId, ownerId: doc.ownerId });
    await assertDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    const permRows = await db
      .select()
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.id, permissionId ?? ""),
          eq(documentPermissions.documentId, documentId ?? ""),
        ),
      );
    if (!permRows.length) throw new NotFoundError("Permission");

    await db
      .update(documentPermissions)
      .set({ accessLevel: body.data.accessLevel })
      .where(eq(documentPermissions.id, permissionId ?? ""));

    await enqueueIndex(documentId ?? "", orgId, "upsert");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.permission_change",
      target: {
        documentId,
        permissionId,
        accessLevel: body.data.accessLevel,
        operation: "update",
      },
      req,
    });

    res.json({
      data: {
        ...permRows[0]!,
        accessLevel: body.data.accessLevel,
        groupId: permRows[0]!.groupId ?? undefined,
        userId: permRows[0]!.userId ?? undefined,
      },
    });
  });

  // DELETE /documents/:documentId/permissions/:permissionId
  router.delete("/documents/:documentId/permissions/:permissionId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId, permissionId } = req.params;

    const doc = await loadDocument(orgId, documentId ?? "");
    assertCanManageDocumentPermissions({ userRole, userId, ownerId: doc.ownerId });
    await assertDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    const permRows = await db
      .select()
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.id, permissionId ?? ""),
          eq(documentPermissions.documentId, documentId ?? ""),
        ),
      );
    if (!permRows.length) throw new NotFoundError("Permission");

    await db.delete(documentPermissions).where(eq(documentPermissions.id, permissionId ?? ""));

    await enqueueIndex(documentId ?? "", orgId, "upsert");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.permission_change",
      target: {
        documentId,
        permissionId,
        groupId: permRows[0]!.groupId,
        userId: permRows[0]!.userId,
        operation: "remove",
      },
      req,
    });

    res.json({ data: { deleted: true } });
  });

  return router;
}
