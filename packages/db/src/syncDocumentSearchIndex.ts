import { eq, and, ne, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { documents } from "./schema.js";
import { resolveSearchIndexContent } from "./searchIndexContent.js";
import { resolveIndexAcl } from "./resolveIndexAcl.js";
import { htmlToPlainText } from "./htmlToPlainText.js";

export type SyncSearchIndexOptions = {
  /** When set (e.g. PDF extraction), used as the searchable body instead of resolved HTML. */
  bodyOverride?: string;
};

function buildSearchVectorSql(
  title: string,
  body: string,
  tags: string[],
) {
  const tagsStr = tags.join(" ");
  return sql`
    setweight(to_tsvector('english', coalesce(${title}, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(${body}, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(${tagsStr}, '')), 'C')
  `;
}

/** Sync denormalized search columns for one document (replaces OpenSearch indexer). */
export async function syncDocumentSearchIndex(
  db: Db,
  documentId: string,
  orgId: string,
  operation: "upsert" | "delete",
  opts?: SyncSearchIndexOptions,
): Promise<void> {
  if (operation === "delete") {
    await db
      .update(documents)
      .set({
        searchTitle: null,
        searchBody: null,
        searchPreview: null,
        searchUpdatedAt: null,
        searchIsEditable: true,
        searchAclGroupIds: [],
        searchAclUserIds: [],
        searchVector: null,
      })
      .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));
    return;
  }

  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));

  if (!rows.length) return;
  const doc = rows[0]!;

  if (doc.status === "trashed") {
    await syncDocumentSearchIndex(db, documentId, orgId, "delete");
    return;
  }

  const { aclGroupIds, aclUserIds } = await resolveIndexAcl(
    db,
    documentId,
    doc.spaceId,
    doc.ownerId,
    doc.visibility,
  );

  const searchable = await resolveSearchIndexContent(db, doc);
  let body = opts?.bodyOverride ?? searchable.body;

  // Attachment-backed PDFs/PPTX: preserve extracted text when content resolver is empty.
  if (
    !opts?.bodyOverride &&
    (doc.type === "pdf" || doc.type === "pptx") &&
    !doc.contentRef &&
    !body.trim()
  ) {
    const existingBody = doc.searchBody;
    if (typeof existingBody === "string" && existingBody.trim()) {
      body = existingBody;
    }
  }

  const plainText = htmlToPlainText(body);
  const searchableBody = plainText || body;
  const isEditable = doc.type === "page" || Boolean(doc.contentRef);
  const preview = plainText.slice(0, 300) || null;

  await db
    .update(documents)
    .set({
      searchTitle: searchable.title,
      searchBody: searchableBody,
      searchPreview: preview,
      searchUpdatedAt: searchable.updatedAt,
      searchIsEditable: isEditable,
      searchAclGroupIds: aclGroupIds,
      searchAclUserIds: aclUserIds,
      searchVector: buildSearchVectorSql(searchable.title, searchableBody, doc.tags),
    })
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));
}

/** Reindex all non-trashed documents in a space (e.g. after space permission change). */
export async function syncSpaceDocumentSearchIndex(
  db: Db,
  orgId: string,
  spaceId: string,
): Promise<void> {
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.spaceId, spaceId),
        eq(documents.orgId, orgId),
        ne(documents.status, "trashed"),
      ),
    );

  await Promise.all(docs.map((doc) => syncDocumentSearchIndex(db, doc.id, orgId, "upsert")));
}
