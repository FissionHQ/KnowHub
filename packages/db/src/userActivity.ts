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
