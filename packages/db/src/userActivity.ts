import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { recentlyViewed, recentlyUpdated } from "./schema.js";

export async function recordRecentlyViewed(
  db: Db,
  userId: string,
  documentId: string,
): Promise<void> {
  await db
    .insert(recentlyViewed)
    .values({ userId, documentId, viewedAt: new Date() })
    .onConflictDoUpdate({
      target: [recentlyViewed.userId, recentlyViewed.documentId],
      set: { viewedAt: new Date() },
    });
}

/** Unique users who have opened this document (popularity signal for search). */
export async function resolveDocumentViewCount(db: Db, documentId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recentlyViewed)
    .where(eq(recentlyViewed.documentId, documentId));
  return rows[0]?.count ?? 0;
}

export async function resolveViewCountsByDocument(
  db: Db,
  documentIds: string[],
): Promise<Map<string, number>> {
  if (!documentIds.length) return new Map();

  const rows = await db
    .select({
      documentId: recentlyViewed.documentId,
      count: sql<number>`count(*)::int`,
    })
    .from(recentlyViewed)
    .where(inArray(recentlyViewed.documentId, documentIds))
    .groupBy(recentlyViewed.documentId);

  return new Map(rows.map((row) => [row.documentId, row.count]));
}

export async function recordRecentlyUpdated(
  db: Db,
  userId: string,
  documentId: string,
): Promise<void> {
  await db
    .insert(recentlyUpdated)
    .values({ userId, documentId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [recentlyUpdated.userId, recentlyUpdated.documentId],
      set: { updatedAt: new Date() },
    });
}
