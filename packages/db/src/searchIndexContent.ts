import { eq, desc } from "drizzle-orm";
import type { Db } from "./client.js";
import { documentVersions } from "./schema.js";

export type DocumentSearchRow = {
  id: string;
  status: string;
  title: string;
  contentRef: string | null;
  updatedAt: Date;
};

export type SearchIndexContent = {
  title: string;
  body: string;
  updatedAt: Date;
};

/**
 * Resolve the title/body that search should index.
 * Published documents use the latest published snapshot only (not draft edits).
 */
export async function resolveSearchIndexContent(
  db: Db,
  doc: DocumentSearchRow,
): Promise<SearchIndexContent> {
  if (doc.status === "published") {
    const versions = await db
      .select({
        titleSnapshot: documentVersions.titleSnapshot,
        contentSnapshot: documentVersions.contentSnapshot,
        editedAt: documentVersions.editedAt,
      })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, doc.id))
      .orderBy(desc(documentVersions.versionNumber))
      .limit(1);

    const latest = versions[0];
    if (latest) {
      return {
        title: latest.titleSnapshot,
        body: latest.contentSnapshot,
        updatedAt: latest.editedAt,
      };
    }
  }

  return {
    title: doc.title,
    body: doc.contentRef ?? "",
    updatedAt: doc.updatedAt,
  };
}
