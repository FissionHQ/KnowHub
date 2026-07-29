import { Router } from "express";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "@wiki/db";
import { documentComments, documents, users } from "@wiki/db";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { assertDocumentAccess } from "../access/permissionResolver.js";

const createSchema = z.object({
  body: z.string().min(1).max(10000),
  parentId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  body: z.string().min(1).max(10000).optional(),
  resolved: z.boolean().optional(),
});

export function createCommentsRouter(db: Db): Router {
  const router = Router();

  // GET /documents/:documentId/comments
  router.get("/documents/:documentId/comments", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;

    const docRows = await db.select().from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));
    if (!docRows.length) throw new NotFoundError("Document");

    await assertDocumentAccess({ db, userRole, userId, groupIds, documentId: docRows[0]!.id, spaceId: docRows[0]!.spaceId, ownerId: docRows[0]!.ownerId, required: "view" });

    const rows = await db
      .select({
        id: documentComments.id,
        documentId: documentComments.documentId,
        parentId: documentComments.parentId,
        authorId: documentComments.authorId,
        authorName: users.name,
        body: documentComments.body,
        resolved: documentComments.resolved,
        createdAt: documentComments.createdAt,
        updatedAt: documentComments.updatedAt,
      })
      .from(documentComments)
      .leftJoin(users, eq(documentComments.authorId, users.id))
      .where(and(eq(documentComments.documentId, documentId ?? ""), eq(documentComments.orgId, orgId)));

    // Build threaded structure: top-level + replies
    const topLevel = rows.filter((r) => !r.parentId);
    const data = topLevel.map((c) => ({
      ...c,
      authorName: c.authorName ?? "Unknown",
      replies: rows
        .filter((r) => r.parentId === c.id)
        .map((r) => ({ ...r, authorName: r.authorName ?? "Unknown" })),
    }));

    res.json({ data });
  });

  // POST /documents/:documentId/comments
  router.post("/documents/:documentId/comments", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;
    const body = createSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const docRows = await db.select().from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));
    if (!docRows.length) throw new NotFoundError("Document");

    await assertDocumentAccess({ db, userRole, userId, groupIds, documentId: docRows[0]!.id, spaceId: docRows[0]!.spaceId, ownerId: docRows[0]!.ownerId, required: "view" });

    if (body.data.parentId) {
      const parentRows = await db.select().from(documentComments)
        .where(and(eq(documentComments.id, body.data.parentId), eq(documentComments.documentId, documentId ?? "")));
      if (!parentRows.length) throw new NotFoundError("Parent comment");
    }

    const inserted = await db.insert(documentComments).values({
      id: uuidv4(),
      orgId,
      documentId: documentId ?? "",
      parentId: body.data.parentId ?? null,
      authorId: userId,
      body: body.data.body,
    }).returning();

    const author = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));

    res.status(201).json({ data: { ...inserted[0]!, authorName: author[0]?.name ?? "Unknown", replies: [] } });
  });

  // PATCH /documents/:documentId/comments/:commentId
  router.patch("/documents/:documentId/comments/:commentId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId, commentId } = req.params;
    const body = updateSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError(body.error.flatten());

    const docRows = await db.select().from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));
    if (!docRows.length) throw new NotFoundError("Document");

    await assertDocumentAccess({ db, userRole, userId, groupIds, documentId: docRows[0]!.id, spaceId: docRows[0]!.spaceId, ownerId: docRows[0]!.ownerId, required: "view" });

    const commentRows = await db.select().from(documentComments)
      .where(and(eq(documentComments.id, commentId ?? ""), eq(documentComments.documentId, documentId ?? "")));
    if (!commentRows.length) throw new NotFoundError("Comment");

    // Only author can edit body; anyone with view access can resolve
    if (body.data.body !== undefined && commentRows[0]!.authorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only the author can edit a comment" } });
      return;
    }

    const updated = await db.update(documentComments)
      .set({
        ...(body.data.body !== undefined ? { body: body.data.body } : {}),
        ...(body.data.resolved !== undefined ? { resolved: body.data.resolved } : {}),
        updatedAt: new Date(),
      })
      .where(eq(documentComments.id, commentId ?? ""))
      .returning();

    res.json({ data: updated[0] });
  });

  // DELETE /documents/:documentId/comments/:commentId
  router.delete("/documents/:documentId/comments/:commentId", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId, commentId } = req.params;

    const docRows = await db.select().from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));
    if (!docRows.length) throw new NotFoundError("Document");

    await assertDocumentAccess({ db, userRole, userId, groupIds, documentId: docRows[0]!.id, spaceId: docRows[0]!.spaceId, ownerId: docRows[0]!.ownerId, required: "view" });

    const commentRows = await db.select().from(documentComments)
      .where(and(eq(documentComments.id, commentId ?? ""), eq(documentComments.documentId, documentId ?? "")));
    if (!commentRows.length) throw new NotFoundError("Comment");

    if (commentRows[0]!.authorId !== userId && userRole !== "admin") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only the author or admin can delete a comment" } });
      return;
    }

    // Delete replies too
    await db.delete(documentComments).where(eq(documentComments.parentId, commentId ?? ""));
    await db.delete(documentComments).where(eq(documentComments.id, commentId ?? ""));

    res.json({ data: { deleted: true } });
  });

  return router;
}
