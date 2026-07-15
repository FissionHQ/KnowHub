/**
 * Bulk re-index all documents into OpenSearch.
 * Run from project root: pnpm --filter @wiki/worker exec tsx src/reindex-all.ts
 */
import { Client } from "@opensearch-project/opensearch";
import { eq } from "drizzle-orm";
import { createDb, documents, spacePermissions, documentPermissions } from "@wiki/db";

const INDEX_NAME = "wiki-documents";
const DB_URL = process.env.DATABASE_URL || "postgresql://wiki:wiki@localhost:5434/wiki";
const OS_URL = process.env.OPENSEARCH_URL || "http://localhost:9200";

const { db, pg } = createDb(DB_URL);
const os = new Client({ node: OS_URL });

async function main() {
  const allDocs = await db.select().from(documents);
  console.log(`Found ${allDocs.length} documents to index`);

  for (const doc of allDocs) {
    const spacePerm = await db
      .select({ groupId: spacePermissions.groupId })
      .from(spacePermissions)
      .where(eq(spacePermissions.spaceId, doc.spaceId));

    const docPerm = await db
      .select({ groupId: documentPermissions.groupId, userId: documentPermissions.userId })
      .from(documentPermissions)
      .where(eq(documentPermissions.documentId, doc.id));

    const aclGroupIds = [
      ...new Set([
        ...spacePerm.map((r) => r.groupId),
        ...docPerm.filter((r) => r.groupId).map((r) => r.groupId!),
      ]),
    ];
    const aclUserIds = docPerm.filter((r) => r.userId).map((r) => r.userId!);

    await os.index({
      index: INDEX_NAME,
      id: doc.id,
      body: {
        org_id: doc.orgId,
        document_id: doc.id,
        space_id: doc.spaceId,
        type: doc.type,
        title: doc.title,
        body: doc.contentRef ?? "",
        tags: doc.tags,
        owner_id: doc.ownerId,
        updated_at: doc.updatedAt.toISOString(),
        acl_group_ids: aclGroupIds,
        acl_user_ids: aclUserIds,
        content_embedding: null,
      },
      refresh: false,
    });
    console.log(`Indexed: ${doc.title} (${doc.id})`);
  }

  await os.indices.refresh({ index: INDEX_NAME });
  console.log("Done! All documents indexed.");
  await pg.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
