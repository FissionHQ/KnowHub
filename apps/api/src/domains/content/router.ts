import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
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
  setTenantContext,
} from "@wiki/db";
import { encodeHtmlAsYjsStateBase64 } from "@wiki/doc-collab";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../../lib/errors.js";
import { assertDocumentAccess, assertSpaceAccess, resolveDocumentAccess, assertCanManageDocumentPermissions, assertCanMutateDocumentContent } from "../access/permissionResolver.js";
import { recordAudit } from "../../lib/audit.js";
import { notifyCollabDocumentReset } from "../../lib/collabReset.js";
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
  status: z.enum(["draft", "published", "trashed"]).optional(),
});

const setPermissionSchema = z.object({
  groupId: z.string().uuid(),
  accessLevel: z.enum(["view", "edit"]),
});

const updatePermissionSchema = z.object({
  accessLevel: z.enum(["view", "edit"]),
});

export function createContentRouter(
  db: Db,
  sqs: SQSClient,
  indexQueueUrl: string,
  redis: Redis,
): Router {
  const router = Router();

  async function enqueueIndex(documentId: string, orgId: string, operation: "upsert" | "delete") {
    const msg: SearchIndexMessage = { type: "SEARCH_INDEX", documentId, orgId, operation };
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: indexQueueUrl,
        MessageBody: JSON.stringify(msg),
      }),
    );
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
      .select()
      .from(documents)
      .where(and(eq(documents.spaceId, spaceId ?? ""), eq(documents.orgId, req.tenant.orgId)));

    res.json({ data: rows });
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

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.create",
      target: { documentId: docId, spaceId: body.data.spaceId, title: body.data.title },
      req,
    });

    res.status(201).json({ data: inserted[0] });
  });

  // GET /documents/:documentId
  router.get("/documents/:documentId", async (req, res) => {
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

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.update",
      target: {
        documentId,
        changes: {
          ...(body.data.title !== undefined ? { title: body.data.title } : {}),
          ...(body.data.content !== undefined ? { contentChanged: true } : {}),
          ...(body.data.tags !== undefined ? { tags: body.data.tags } : {}),
          ...(body.data.status !== undefined ? { status: body.data.status } : {}),
        },
        version: newVersion,
      },
      req,
    });

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

    await assertCanMutateDocumentContent({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      ownerId: doc.ownerId,
    });

    await db
      .update(documents)
      .set({ status: "trashed", updatedAt: new Date() })
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    await enqueueIndex(documentId ?? "", orgId, "delete");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.delete",
      target: { documentId, title: doc.title, spaceId: doc.spaceId },
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

    const restored = await db
      .update(documents)
      .set({ status: "published", updatedAt: new Date() })
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)))
      .returning();

    await enqueueIndex(documentId ?? "", orgId, "upsert");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.restore",
      target: { documentId, title: doc.title, spaceId: doc.spaceId },
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

  // POST /documents/:documentId/versions/:versionNumber/restore
  router.post("/documents/:documentId/versions/:versionNumber/restore", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;
    const versionNumber = Number.parseInt(req.params.versionNumber ?? "", 10);

    if (!Number.isFinite(versionNumber) || versionNumber < 1) {
      throw new ValidationError({ versionNumber: ["Invalid version number"] });
    }

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Document");
    const doc = rows[0]!;

    if (doc.status === "trashed") {
      throw new ConflictError("Cannot restore a version of a trashed document");
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

    const versionRows = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, documentId ?? ""),
          eq(documentVersions.versionNumber, versionNumber),
        ),
      );

    if (!versionRows.length) throw new NotFoundError("Document version");
    const sourceVersion = versionRows[0]!;

    const restoredDoc = await db.transaction(async (tx) => {
      await setTenantContext(tx, orgId);

      const locked = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)))
        .for("update");

      const current = locked[0];
      if (!current) throw new NotFoundError("Document");

      const newVersion = current.version + 1;
      const collabState = encodeHtmlAsYjsStateBase64(sourceVersion.contentSnapshot);

      const updated = await tx
        .update(documents)
        .set({
          contentRef: sourceVersion.contentSnapshot,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)))
        .returning();

      await tx.insert(documentVersions).values({
        id: uuidv4(),
        documentId: documentId ?? "",
        versionNumber: newVersion,
        contentSnapshot: sourceVersion.contentSnapshot,
        editedBy: userId,
      });

      await tx
        .insert(documentCollabState)
        .values({
          documentId: documentId ?? "",
          orgId,
          state: collabState,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: documentCollabState.documentId,
          set: { state: collabState, updatedAt: new Date() },
        });

      return updated[0]!;
    });

    await enqueueIndex(documentId ?? "", orgId, "upsert");
    await notifyCollabDocumentReset(redis, orgId, documentId ?? "");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.version_restore",
      target: {
        documentId,
        restoredFromVersion: versionNumber,
        newVersion: restoredDoc.version,
      },
      req,
    });

    res.json({
      data: restoredDoc,
      reloadRequired: true,
    });
  });

  async function loadDocument(orgId: string, documentId: string) {
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));
    if (!rows.length) throw new NotFoundError("Document");
    return rows[0]!;
  }

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

    const groupRows = await db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, body.data.groupId), eq(groups.orgId, orgId)));
    if (!groupRows.length) throw new NotFoundError("Group");

    const existing = await db
      .select()
      .from(documentPermissions)
      .where(
        and(
          eq(documentPermissions.documentId, documentId ?? ""),
          eq(documentPermissions.groupId, body.data.groupId),
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
        groupId: body.data.groupId,
        userId: null,
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
    if (permRows[0]!.userId) {
      throw new ForbiddenError("Per-user document sharing is not enabled");
    }

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
    if (permRows[0]!.userId) {
      throw new ForbiddenError("Per-user document sharing is not enabled");
    }

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
