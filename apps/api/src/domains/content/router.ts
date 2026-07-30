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
  recordRecentlyUpdated,
  saveDocumentContent,
  publishDocumentVersion,
  appendRestoredDocumentVersion,
  discardDocumentDraft,
  hasUnpublishedChanges,
  isTitleChanged,
  syncDocumentSearchIndex,
  findSpaceByRef,
  allocateDocumentSlug,
  findDocumentByRef,
} from "@wiki/db";
import { encodeHtmlAsYjsStateBase64, isHtmlContentChanged } from "@wiki/doc-collab";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../../lib/errors.js";
import {
  assertDocumentAccess,
  assertSpaceAccess,
  resolveDocumentAccess,
  assertCanManageDocumentPermissions,
  assertCanGrantDocumentPermissionToUser,
  assertCanMutateDocumentContent,
  filterViewableDocuments,
} from "../access/permissionResolver.js";
import { recordAudit } from "../../lib/audit.js";
import { notifyCollabDocumentReset } from "../../lib/collabReset.js";
import { logger } from "../../lib/logger.js";
import type { Redis } from "ioredis";

const createDocSchema = z.object({
  spaceId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  type: z.enum(["page", "pdf"]).default("page"),
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
  visibility: z.enum(["inherit", "restricted"]).optional(),
  publish: z.boolean().optional(),
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

type DocRowForClient = {
  id: string;
  orgId: string;
  spaceId: string;
  parentId: string | null;
  type: string;
  title: string;
  slug: string;
  contentRef: string | null;
  ownerId: string;
  ownerName?: string | null;
  status: string;
  version: number;
  tags: string[];
  restrictDownload: boolean;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
  draftTitle?: string | null;
  draftContentRef?: string | null;
  draftUpdatedAt?: Date | null;
  draftUpdatedBy?: string | null;
};

function shapeDocumentResponse(
  doc: DocRowForClient,
  accessLevel: "view" | "edit",
) {
  const unpublished = hasUnpublishedChanges(doc);
  const canEdit = accessLevel === "edit";
  // Prefer draft when present so editors always bind to the working copy.
  const editableTitle = canEdit
    ? unpublished
      ? (doc.draftTitle ?? doc.title)
      : doc.title
    : doc.title;
  const editableContentRef = canEdit
    ? unpublished
      ? (doc.draftContentRef ?? doc.contentRef)
      : doc.contentRef
    : doc.contentRef;

  const {
    draftTitle: _dt,
    draftContentRef: _dc,
    draftUpdatedAt: _da,
    draftUpdatedBy: _db,
    ...rest
  } = doc;

  return {
    ...rest,
    accessLevel,
    hasUnpublishedChanges: canEdit ? unpublished : false,
    editableTitle,
    editableContentRef,
  };
}

export function createContentRouter(
  db: Db,
  redis: Redis,
): Router {
  const router = Router();

  async function syncSearchIndex(documentId: string, orgId: string, operation: "upsert" | "delete") {
    try {
      await syncDocumentSearchIndex(db, documentId, orgId, operation);
    } catch (err) {
      logger.warn("Failed to sync document search index", { err, documentId, orgId, operation });
    }
  }

  // GET /spaces/:spaceId/documents — spaceId may be UUID or slug
  router.get("/spaces/:spaceId/documents", async (req, res) => {
    const { userRole, userId, groupIds, orgId } = req.tenant;
    const space = await findSpaceByRef(db, orgId, req.params.spaceId ?? "");
    if (!space) throw new NotFoundError("Space");

    await assertSpaceAccess({
      db,
      userRole,
      userId,
      groupIds,
      spaceId: space.id,
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
        slug: documents.slug,
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
          eq(documents.spaceId, space.id),
          eq(documents.orgId, orgId),
          ne(documents.status, "trashed"),
        ),
      );

    const visible = await filterViewableDocuments(
      { db, userRole, userId, groupIds },
      rows,
    );
    res.json({ data: visible });
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
    const docType = body.data.type;
    // PDF attachment docs omit content; imported PDFs send converted HTML with type pdf.
    const contentRef =
      docType === "pdf"
        ? body.data.content || null
        : body.data.content || "";
    const slug = await allocateDocumentSlug(db, orgId, body.data.title, docId);

    const inserted = await db
      .insert(documents)
      .values({
        id: docId,
        orgId,
        spaceId: body.data.spaceId,
        parentId: body.data.parentId ?? null,
        type: docType,
        title: body.data.title,
        slug,
        contentRef,
        ownerId: userId,
        status: "draft",
        version: 1,
        tags: body.data.tags,
      })
      .returning();

    await syncSearchIndex(docId, orgId, "upsert");
    await recordRecentlyUpdated(db, userId, docId);

    res.status(201).json({ data: shapeDocumentResponse(inserted[0]!, "edit") });
  });

  // GET /documents/:documentId — documentId may be UUID or slug
  router.get("/documents/:documentId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;

    const resolved = await findDocumentByRef(db, orgId, documentId ?? "");
    if (!resolved) throw new NotFoundError("Document");

    const rows = await db
      .select({
        id: documents.id,
        orgId: documents.orgId,
        spaceId: documents.spaceId,
        parentId: documents.parentId,
        type: documents.type,
        title: documents.title,
        slug: documents.slug,
        contentRef: documents.contentRef,
        ownerId: documents.ownerId,
        ownerName: users.name,
        status: documents.status,
        version: documents.version,
        tags: documents.tags,
        restrictDownload: documents.restrictDownload,
        visibility: documents.visibility,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        draftTitle: documents.draftTitle,
        draftContentRef: documents.draftContentRef,
        draftUpdatedAt: documents.draftUpdatedAt,
        draftUpdatedBy: documents.draftUpdatedBy,
      })
      .from(documents)
      .leftJoin(users, eq(documents.ownerId, users.id))
      .where(and(eq(documents.id, resolved.id), eq(documents.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Document");
    const doc = rows[0]!;

    if (doc.status === "trashed" && userRole !== "admin") {
      throw new NotFoundError("Document");
    }

    await assertDocumentAccess({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      ownerId: doc.ownerId,
      visibility: doc.visibility,
      required: "view",
    });

    const accessLevel = await resolveDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      ownerId: doc.ownerId,
      visibility: doc.visibility,
    });

    res.json({ data: shapeDocumentResponse(doc, accessLevel) });
  });

  // POST /documents/:documentId/discard-draft — clear unpublished WIP
  router.post("/documents/:documentId/discard-draft", async (req, res) => {
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
    if (doc.status !== "published") {
      throw new ConflictError("Only published documents have an unpublished draft");
    }
    if (!hasUnpublishedChanges(doc)) {
      // Client may still have unsaved typing in the live Yjs room — reset to published HTML.
      if (doc.type === "page" || doc.contentRef !== null) {
        await resetCollabStateAfterContentChange(orgId, documentId ?? "", doc.contentRef ?? "");
      }
      res.json({
        data: shapeDocumentResponse({ ...doc, ownerName: null }, "edit"),
        reloadRequired: true,
      });
      return;
    }

    await assertCanMutateDocumentContent({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      ownerId: doc.ownerId,
    });

    await db.transaction(async (tx) => {
      await setTenantContext(tx, orgId);
      await discardDocumentDraft(tx, { id: doc.id, orgId: doc.orgId });
    });

    if (doc.type === "page" || doc.contentRef) {
      await resetCollabStateAfterContentChange(orgId, documentId ?? "", doc.contentRef ?? "");
    }

    const refreshed = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    res.json({
      data: shapeDocumentResponse({ ...refreshed[0]!, ownerName: null }, "edit"),
      reloadRequired: true,
    });
  });

  // PATCH /documents/:documentId — documentId may be UUID or slug
  router.patch("/documents/:documentId", async (req, res) => {
    const body = updateDocSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;

    const doc = await findDocumentByRef(db, orgId, documentId ?? "");
    if (!doc) throw new NotFoundError("Document");
    const resolvedId = doc.id;

    if (doc.status === "trashed") {
      throw new ConflictError("Document is in trash");
    }

    await assertCanMutateDocumentContent({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      ownerId: doc.ownerId,
    });

    const hasTitle = body.data.title !== undefined;
    const hasContent = body.data.content !== undefined;
    const unpublishing =
      body.data.status === "draft" &&
      doc.status === "published" &&
      body.data.publish !== true;
    const hasMetadata =
      body.data.tags !== undefined ||
      body.data.status !== undefined ||
      body.data.restrictDownload !== undefined ||
      body.data.visibility !== undefined;

    // Compare against editable base (draft if present) so re-saving identical draft is a no-op.
    const hasDraft = hasUnpublishedChanges(doc);
    const baseTitle = hasDraft ? (doc.draftTitle ?? doc.title) : doc.title;
    const baseContent = hasDraft
      ? (doc.draftContentRef ?? doc.contentRef)
      : doc.contentRef;

    const titleWillChange =
      hasTitle && isTitleChanged(baseTitle, body.data.title!);
    const contentWillChange =
      hasContent && isHtmlContentChanged(baseContent, body.data.content!);
    const publishing = body.data.publish === true;

    if (!publishing && !titleWillChange && !contentWillChange && !hasMetadata) {
      res.json({ data: shapeDocumentResponse(doc, "edit") });
      return;
    }

    const metadataUpdates: {
      tags?: string[];
      status?: "draft" | "published";
      restrictDownload?: boolean;
      visibility?: "inherit" | "restricted";
      updatedAt?: Date;
    } = {};
    if (body.data.tags !== undefined) metadataUpdates.tags = body.data.tags;
    if (body.data.restrictDownload !== undefined) {
      metadataUpdates.restrictDownload = body.data.restrictDownload;
    }
    if (body.data.visibility !== undefined) {
      metadataUpdates.visibility = body.data.visibility;
    }
    // Unpublish is handled below (promote draft → live); don't set status twice.
    if (body.data.status !== undefined && !publishing && !unpublishing) {
      metadataUpdates.status = body.data.status;
    }

    let updated = await db.transaction(async (tx) => {
      await setTenantContext(tx, orgId);

      const docRow = {
        id: doc.id,
        orgId: doc.orgId,
        version: doc.version,
        title: doc.title,
        contentRef: doc.contentRef,
        status: doc.status,
        draftTitle: doc.draftTitle,
        draftContentRef: doc.draftContentRef,
      };

      if (publishing) {
        await publishDocumentVersion(tx, {
          doc: docRow,
          editedBy: userId,
          ...(hasContent ? { contentRef: body.data.content } : {}),
          ...(hasTitle ? { title: body.data.title } : {}),
        });
      } else if (unpublishing) {
        const liveTitle = hasTitle
          ? body.data.title!.trim()
          : hasDraft
            ? (doc.draftTitle ?? doc.title)
            : doc.title;
        const liveContent = hasContent
          ? body.data.content!
          : hasDraft
            ? (doc.draftContentRef ?? doc.contentRef)
            : doc.contentRef;
        await tx
          .update(documents)
          .set({
            title: liveTitle,
            contentRef: liveContent,
            status: "draft",
            draftTitle: null,
            draftContentRef: null,
            draftUpdatedAt: null,
            draftUpdatedBy: null,
            updatedAt: new Date(),
          })
          .where(and(eq(documents.id, resolvedId), eq(documents.orgId, orgId)));

        if (Object.keys(metadataUpdates).length > 0) {
          metadataUpdates.updatedAt = new Date();
          await tx
            .update(documents)
            .set(metadataUpdates)
            .where(and(eq(documents.id, resolvedId), eq(documents.orgId, orgId)));
        }
      } else {
        if (titleWillChange || contentWillChange) {
          await saveDocumentContent(tx, {
            doc: docRow,
            editedBy: userId,
            ...(hasTitle ? { nextTitle: body.data.title } : {}),
            ...(hasContent ? { nextContent: body.data.content } : {}),
          });
        }

        if (Object.keys(metadataUpdates).length > 0) {
          metadataUpdates.updatedAt = new Date();
          await tx
            .update(documents)
            .set(metadataUpdates)
            .where(and(eq(documents.id, resolvedId), eq(documents.orgId, orgId)));
        }
      }

      const result = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, resolvedId), eq(documents.orgId, orgId)));
      return result[0]!;
    });

    // Keep URL slug in sync with the published/working title.
    if (updated.title !== doc.title) {
      const nextSlug = await allocateDocumentSlug(
        db,
        orgId,
        updated.title,
        updated.id,
        updated.id,
      );
      if (nextSlug !== updated.slug) {
        const slugRows = await db
          .update(documents)
          .set({ slug: nextSlug })
          .where(and(eq(documents.id, updated.id), eq(documents.orgId, orgId)))
          .returning();
        updated = slugRows[0]!;
      }
    }

    const contentOrMetadataChanged =
      publishing || titleWillChange || contentWillChange || hasMetadata;
    const draftEditOnPublished =
      doc.status === "published" &&
      !publishing &&
      !unpublishing &&
      (titleWillChange || contentWillChange);

    if (contentOrMetadataChanged && !draftEditOnPublished) {
      await syncSearchIndex(resolvedId, orgId, "upsert");
      await recordRecentlyUpdated(db, userId, resolvedId);
    } else if (titleWillChange || contentWillChange) {
      await recordRecentlyUpdated(db, userId, resolvedId);
    }

    // Align collab Yjs with newly published body so reconnect doesn't recreate a draft.
    if (publishing && (updated.type === "page" || updated.contentRef)) {
      await resetCollabStateAfterContentChange(
        orgId,
        resolvedId,
        updated.contentRef ?? "",
      );
    }

    res.json({ data: shapeDocumentResponse(updated, "edit") });
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

    await syncSearchIndex(documentId ?? "", orgId, "delete");

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

    await syncSearchIndex(documentId ?? "", orgId, "upsert");

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
      ownerId: doc.ownerId,
      required: "view",
    });

    const versions = await db
      .select({
        id: documentVersions.id,
        documentId: documentVersions.documentId,
        versionNumber: documentVersions.versionNumber,
        contentSnapshot: documentVersions.contentSnapshot,
        titleSnapshot: documentVersions.titleSnapshot,
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

    if (versionNumber === doc.version && !hasUnpublishedChanges(doc)) {
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

    const versionRow = versionRows[0]!;
    const restoredContent = versionRow.contentSnapshot;
    const restoredTitle = versionRow.titleSnapshot;

    const updated = await db.transaction(async (tx) => {
      await setTenantContext(tx, orgId);
      await appendRestoredDocumentVersion(tx, {
        doc: {
          id: doc.id,
          orgId: doc.orgId,
          version: doc.version,
          title: doc.title,
          contentRef: doc.contentRef,
          status: doc.status,
          draftTitle: doc.draftTitle,
          draftContentRef: doc.draftContentRef,
        },
        contentSnapshot: restoredContent,
        titleSnapshot: restoredTitle,
        editedBy: userId,
      });
      const rows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));
      return rows[0]!;
    });

    if (doc.type === "page" || doc.contentRef || restoredContent) {
      await resetCollabStateAfterContentChange(orgId, documentId ?? "", restoredContent);
    }

    // Published restore lands in draft_* — search still serves the published body.
    if (doc.status !== "published") {
      await syncSearchIndex(documentId ?? "", orgId, "upsert");
    }
    await recordRecentlyUpdated(db, userId, documentId ?? "");

    await recordAudit(db, {
      orgId,
      actorId: userId,
      action: "document.version_restore",
      target: {
        documentId,
        fromVersion: versionNumber,
        intoDraft: doc.status === "published",
        publishedVersion: doc.version,
        title: restoredTitle,
        spaceId: doc.spaceId,
      },
      req,
    });

    res.json({
      data: shapeDocumentResponse(updated, "edit"),
      reloadRequired: true,
    });
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
      ownerId: doc.ownerId,
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
      ownerId: doc.ownerId,
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
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(and(eq(users.id, body.data.userId), eq(users.orgId, orgId)));
      if (!userRows.length) throw new NotFoundError("User");
      assertCanGrantDocumentPermissionToUser({
        actorRole: userRole,
        actorId: userId,
        targetUserId: userRows[0]!.id,
        targetUserRole: userRows[0]!.role,
      });
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

    await syncSearchIndex(documentId ?? "", orgId, "upsert");

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
      ownerId: doc.ownerId,
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
      const targetRows = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(and(eq(users.id, permRows[0]!.userId!), eq(users.orgId, orgId)));
      if (targetRows.length) {
        assertCanGrantDocumentPermissionToUser({
          actorRole: userRole,
          actorId: userId,
          targetUserId: targetRows[0]!.id,
          targetUserRole: targetRows[0]!.role,
        });
      }
    }

    await db
      .update(documentPermissions)
      .set({ accessLevel: body.data.accessLevel })
      .where(eq(documentPermissions.id, permissionId ?? ""));

    await syncSearchIndex(documentId ?? "", orgId, "upsert");

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
      ownerId: doc.ownerId,
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
      const targetRows = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(and(eq(users.id, permRows[0]!.userId!), eq(users.orgId, orgId)));
      if (targetRows.length) {
        assertCanGrantDocumentPermissionToUser({
          actorRole: userRole,
          actorId: userId,
          targetUserId: targetRows[0]!.id,
          targetUserRole: targetRows[0]!.role,
        });
      }
    }

    await db.delete(documentPermissions).where(eq(documentPermissions.id, permissionId ?? ""));

    await syncSearchIndex(documentId ?? "", orgId, "upsert");

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
