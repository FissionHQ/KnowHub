import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import {
  documents,
  documentVersions,
  documentPermissions,
  spacePermissions,
  groups,
  users,
} from "@wiki/db";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { assertDocumentAccess, assertSpaceAccess } from "../access/permissionResolver.js";
import { recordAudit } from "../../lib/audit.js";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { SearchIndexMessage } from "@wiki/types";

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

export function createContentRouter(db: Db, sqs: SQSClient, indexQueueUrl: string): Router {
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

    await assertSpaceAccess({ db, userRole, userId, groupIds, spaceId: spaceId ?? "", required: "view" });

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
      db, userRole, userId, groupIds,
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
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .leftJoin(users, eq(documents.ownerId, users.id))
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Document");
    const doc = rows[0]!;

    await assertDocumentAccess({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    const lastVersion = await db
      .select({ editedByName: users.name })
      .from(documentVersions)
      .leftJoin(users, eq(documentVersions.editedBy, users.id))
      .where(eq(documentVersions.documentId, documentId ?? ""))
      .orderBy(desc(documentVersions.versionNumber))
      .limit(1);

    res.json({
      data: {
        ...doc,
        ownerName: doc.ownerName ?? undefined,
        lastEditedByName: lastVersion[0]?.editedByName ?? undefined,
      },
    });
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

    await assertDocumentAccess({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "edit",
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

    await assertDocumentAccess({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "edit",
    });

    await db
      .update(documents)
      .set({ status: "trashed", updatedAt: new Date() })
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    await enqueueIndex(documentId ?? "", orgId, "delete");

    res.json({ data: { trashed: true } });
  });

  // GET /documents/:documentId/children
  router.get("/documents/:documentId/children", async (req, res) => {
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

    const children = await db
      .select()
      .from(documents)
      .where(and(eq(documents.parentId, documentId ?? ""), eq(documents.orgId, orgId)));

    res.json({ data: children });
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
        editedByName: users.name,
        editedAt: documentVersions.editedAt,
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
    const { documentId, versionNumber } = req.params;

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
      required: "edit",
    });

    const versionRows = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, documentId ?? ""),
          eq(documentVersions.versionNumber, parseInt(versionNumber ?? "0", 10)),
        ),
      );

    if (!versionRows.length) throw new NotFoundError("Version");
    const version = versionRows[0]!;

    // Use max versionNumber from documentVersions to avoid unique constraint violations
    const maxRows = await db
      .select({ max: documentVersions.versionNumber })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId ?? ""))
      .orderBy(desc(documentVersions.versionNumber))
      .limit(1);

    const newVersion = (maxRows[0]?.max ?? doc.version) + 1;

    const updated = await db
      .update(documents)
      .set({ contentRef: version.contentSnapshot, version: newVersion, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)))
      .returning();

    await db.insert(documentVersions).values({
      id: uuidv4(),
      documentId: documentId ?? "",
      versionNumber: newVersion,
      contentSnapshot: version.contentSnapshot,
      editedBy: userId,
    });

    await enqueueIndex(documentId ?? "", orgId, "upsert").catch(() => null);

    res.json({ data: updated[0] });
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
      required: "edit",
    });

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
    await assertDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "edit",
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
    await assertDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "edit",
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
    await assertDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "edit",
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
