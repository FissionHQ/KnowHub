import { Router } from "express";
import { eq, and, desc, ne, inArray } from "drizzle-orm";
import type { Db } from "@wiki/db";
import {
  recentlyViewed,
  recentlyUpdated,
  favorites,
  documents,
  recordRecentlyViewed,
  recordRecentlyUpdated,
} from "@wiki/db";
import { NotFoundError } from "../../lib/errors.js";
import {
  assertDocumentAccess,
  resolveAccessibleSpaceIds,
} from "../access/permissionResolver.js";

const documentFields = {
  id: documents.id,
  orgId: documents.orgId,
  spaceId: documents.spaceId,
  parentId: documents.parentId,
  type: documents.type,
  title: documents.title,
  contentRef: documents.contentRef,
  ownerId: documents.ownerId,
  status: documents.status,
  version: documents.version,
  tags: documents.tags,
  restrictDownload: documents.restrictDownload,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

export function createUserActivityRouter(db: Db): Router {
  const router = Router();

  // POST /documents/:documentId/view — record a view
  router.post("/documents/:documentId/view", async (req, res) => {
    const { userId, orgId, userRole, groupIds } = req.tenant;
    const { documentId } = req.params;

    const docRows = await db
      .select({ id: documents.id, spaceId: documents.spaceId, status: documents.status })
      .from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

    if (!docRows.length) throw new NotFoundError("Document");
    const doc = docRows[0]!;

    if (doc.status === "trashed" && userRole !== "admin") {
      throw new NotFoundError("Document");
    }

    await assertDocumentAccess({
      db,
      userRole,
      userId,
      groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    await recordRecentlyViewed(db, userId, documentId ?? "");

    res.json({ data: { recorded: true } });
  });

  // GET /users/me/recent — recently viewed documents (ACL-scoped)
  router.get("/users/me/recent", async (req, res) => {
    const { userId, orgId, userRole, groupIds } = req.tenant;

    const accessibleSpaceIds = await resolveAccessibleSpaceIds({
      db,
      userRole,
      userId,
      groupIds,
    });

    if (accessibleSpaceIds !== null && !accessibleSpaceIds.length) {
      return res.json({ data: [] });
    }

    const conditions = [
      eq(recentlyViewed.userId, userId),
      eq(documents.orgId, orgId),
      ne(documents.status, "trashed"),
      ...(accessibleSpaceIds !== null
        ? [inArray(documents.spaceId, accessibleSpaceIds)]
        : []),
    ];

    const rows = await db
      .select({
        ...documentFields,
        viewedAt: recentlyViewed.viewedAt,
      })
      .from(recentlyViewed)
      .innerJoin(documents, eq(recentlyViewed.documentId, documents.id))
      .where(and(...conditions))
      .orderBy(desc(recentlyViewed.viewedAt))
      .limit(20);

    res.json({ data: rows });
  });

  // GET /users/me/recently-updated — documents this user recently edited (ACL-scoped)
  router.get("/users/me/recently-updated", async (req, res) => {
    const { userId, orgId, userRole, groupIds } = req.tenant;

    const accessibleSpaceIds = await resolveAccessibleSpaceIds({
      db,
      userRole,
      userId,
      groupIds,
    });

    if (accessibleSpaceIds !== null && !accessibleSpaceIds.length) {
      return res.json({ data: [] });
    }

    const conditions = [
      eq(recentlyUpdated.userId, userId),
      eq(documents.orgId, orgId),
      ne(documents.status, "trashed"),
      ...(accessibleSpaceIds !== null
        ? [inArray(documents.spaceId, accessibleSpaceIds)]
        : []),
    ];

    const rows = await db
      .select({
        ...documentFields,
        editedAt: recentlyUpdated.updatedAt,
      })
      .from(recentlyUpdated)
      .innerJoin(documents, eq(recentlyUpdated.documentId, documents.id))
      .where(and(...conditions))
      .orderBy(desc(recentlyUpdated.updatedAt))
      .limit(20);

    res.json({ data: rows });
  });

  // POST /documents/:documentId/favorite — toggle favorite
  router.post("/documents/:documentId/favorite", async (req, res) => {
    const { userId } = req.tenant;
    const { documentId } = req.params;

    const existing = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.documentId, documentId ?? "")));

    if (existing.length) {
      await db
        .delete(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.documentId, documentId ?? "")));
      res.json({ data: { favorited: false } });
    } else {
      await db
        .insert(favorites)
        .values({ userId, documentId: documentId ?? "" });
      res.json({ data: { favorited: true } });
    }
  });

  // GET /documents/:documentId/favorite — check if favorited
  router.get("/documents/:documentId/favorite", async (req, res) => {
    const { userId } = req.tenant;
    const { documentId } = req.params;

    const rows = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.documentId, documentId ?? "")));

    res.json({ data: { favorited: rows.length > 0 } });
  });

  // GET /users/me/favorites — list favorites (ACL-scoped)
  router.get("/users/me/favorites", async (req, res) => {
    const { userId, orgId, userRole, groupIds } = req.tenant;

    const accessibleSpaceIds = await resolveAccessibleSpaceIds({
      db,
      userRole,
      userId,
      groupIds,
    });

    if (accessibleSpaceIds !== null && !accessibleSpaceIds.length) {
      return res.json({ data: [] });
    }

    const conditions = [
      eq(favorites.userId, userId),
      eq(documents.orgId, orgId),
      ne(documents.status, "trashed"),
      ...(accessibleSpaceIds !== null
        ? [inArray(documents.spaceId, accessibleSpaceIds)]
        : []),
    ];

    const rows = await db
      .select(documentFields)
      .from(favorites)
      .innerJoin(documents, eq(favorites.documentId, documents.id))
      .where(and(...conditions))
      .orderBy(desc(favorites.createdAt))
      .limit(50);

    res.json({ data: rows });
  });

  return router;
}
