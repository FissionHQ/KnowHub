/**
 * Bulk re-index all documents into OpenSearch.
 * Run from project root: pnpm --filter @wiki/worker exec tsx src/reindex-all.ts
 */
import { Client } from "@opensearch-project/opensearch";
import { eq, ne } from "drizzle-orm";
import { createDb, documents, spacePermissions, documentPermissions, resolveSearchIndexContent, resolveViewCountsByDocument } from "@wiki/db";
import { htmlToPlainText } from "./htmlToPlainText.js";

const INDEX_NAME = "wiki-documents";
const DB_URL = process.env.DATABASE_URL || "postgresql://wiki:wiki@localhost:5434/wiki";
const OS_URL = process.env.OPENSEARCH_URL || "http://localhost:9200";

const { db, pg } = createDb(DB_URL);
const os = new Client({ node: OS_URL });

async function main() {
  const allDocs = await db
    .select()
    .from(documents)
    .where(ne(documents.status, "trashed"));
  console.log(`Found ${allDocs.length} documents to index`);

  const viewCounts = await resolveViewCountsByDocument(
    db,
    allDocs.map((d) => d.id),
  );

  for (const doc of allDocs) {
    const spacePerm = await db
      .select({ groupId: spacePermissions.groupId })
      .from(spacePermissions)
      .where(eq(spacePermissions.spaceId, doc.spaceId));

    const docPerm = await db
      .select({ groupId: documentPermissions.groupId, userId: documentPermissions.userId })
      .from(documentPermissions)
      .where(eq(documentPermissions.documentId, doc.id));

    const aclUserIds = [
      ...new Set([
        doc.ownerId,
        ...docPerm.filter((r) => r.userId).map((r) => r.userId!),
      ]),
    ];

    const aclGroupIds = docPerm.length
      ? [...new Set(docPerm.filter((r) => r.groupId).map((r) => r.groupId!))]
      : [...new Set(spacePerm.map((r) => r.groupId))];

    const searchable = await resolveSearchIndexContent(db, doc);
    const plainText = htmlToPlainText(searchable.body);
    const searchableBody = plainText || searchable.body;
    const isEditable = doc.type === "page" || Boolean(doc.contentRef);

    await os.index({
      index: INDEX_NAME,
      id: doc.id,
      body: {
        org_id: doc.orgId,
        document_id: doc.id,
        space_id: doc.spaceId,
        type: doc.type,
        is_editable: isEditable,
        title: searchable.title,
        body: searchableBody,
        tags: doc.tags,
        owner_id: doc.ownerId,
        updated_at: searchable.updatedAt.toISOString(),
        view_count: viewCounts.get(doc.id) ?? 0,
        acl_group_ids: aclGroupIds,
        acl_user_ids: aclUserIds,
        content_embedding: null,
        preview: plainText.slice(0, 300) || null,
      },
      refresh: false,
    });
    console.log(`Indexed: ${doc.title} (${doc.id})`);
  }

  const activeIds = new Set(allDocs.map((d) => d.id));
  const existing = await os.search({
    index: INDEX_NAME,
    body: { query: { match_all: {} }, size: 10000, _source: false },
  });
  let removed = 0;
  for (const hit of existing.body.hits.hits as { _id: string }[]) {
    if (!activeIds.has(hit._id)) {
      await os.delete({ index: INDEX_NAME, id: hit._id, refresh: false });
      console.log(`Removed stale index entry: ${hit._id}`);
      removed++;
    }
  }

  await os.indices.refresh({ index: INDEX_NAME });
  console.log(`Done! Indexed ${allDocs.length} documents, removed ${removed} stale entries.`);
  await pg.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
