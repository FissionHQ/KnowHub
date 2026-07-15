/**
 * Bulk re-index all documents into OpenSearch.
 * Run with: npx tsx scripts/reindex.ts
 */
import { Client } from "@opensearch-project/opensearch";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq } from "drizzle-orm";
import { documents, spacePermissions, documentPermissions } from "@wiki/db";

const INDEX_NAME = "wiki-documents";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://wiki:wiki@localhost:5434/wiki" });
const db = drizzle(pool);

const os = new Client({
  node: process.env.OPENSEARCH_URL || "http://localhost:9200",
  ssl: undefined,
});

async function main() {
  // Ensure index exists
  const exists = await os.indices.exists({ index: INDEX_NAME });
  if (!exists.body) {
    await os.indices.create({
      index: INDEX_NAME,
      body: {
        mappings: {
          properties: {
            org_id: { type: "keyword" },
            document_id: { type: "keyword" },
            space_id: { type: "keyword" },
            type: { type: "keyword" },
            title: { type: "text", analyzer: "standard" },
            body: { type: "text", analyzer: "standard" },
            tags: { type: "keyword" },
            owner_id: { type: "keyword" },
            updated_at: { type: "date" },
            acl_group_ids: { type: "keyword" },
            acl_user_ids: { type: "keyword" },
          },
        },
      },
    });
    console.log("Created index:", INDEX_NAME);
  }

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
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
