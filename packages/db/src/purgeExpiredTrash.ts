import { and, eq, lt, or, isNull } from "drizzle-orm";
import type { Db } from "./client.js";
import { documents, organizations } from "./schema.js";

export interface PurgedTrashDocument {
  documentId: string;
  orgId: string;
  title: string;
  spaceId: string;
}

/** Returns the instant after which a trashed document is eligible for permanent deletion. */
export function trashPurgeAt(trashedAt: Date, retentionDays: number): Date {
  const purgeAt = new Date(trashedAt);
  purgeAt.setDate(purgeAt.getDate() + retentionDays);
  return purgeAt;
}

export function isWithinTrashRetention(trashedAt: Date, retentionDays: number, now = new Date()): boolean {
  return now < trashPurgeAt(trashedAt, retentionDays);
}

/**
 * Permanently deletes documents that have been in trash longer than each org's
 * trashRetentionDays setting.
 */
export async function purgeExpiredTrash(
  db: Db,
): Promise<PurgedTrashDocument[]> {
  const purged: PurgedTrashDocument[] = [];

  const orgs = await db
    .select({
      id: organizations.id,
      trashRetentionDays: organizations.trashRetentionDays,
    })
    .from(organizations);

  for (const org of orgs) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - org.trashRetentionDays);

    const expired = await db
      .select({
        id: documents.id,
        title: documents.title,
        spaceId: documents.spaceId,
      })
      .from(documents)
      .where(
        and(
          eq(documents.orgId, org.id),
          eq(documents.status, "trashed"),
          or(
            lt(documents.trashedAt, cutoff),
            and(isNull(documents.trashedAt), lt(documents.updatedAt, cutoff)),
          ),
        ),
      );

    for (const doc of expired) {
      await db.delete(documents).where(eq(documents.id, doc.id));
      purged.push({
        documentId: doc.id,
        orgId: org.id,
        title: doc.title,
        spaceId: doc.spaceId,
      });
    }
  }

  return purged;
}
