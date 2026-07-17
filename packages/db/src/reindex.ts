import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@opensearch-project/opensearch";
import { eq, ne } from "drizzle-orm";
import { createDb, documents, spacePermissions, documentPermissions } from "./index.js";
import { resolveSearchIndexContent } from "./searchIndexContent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

const INDEX_NAME = "wiki-documents";

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const opensearchUrl = process.env["OPENSEARCH_URL"] ?? "http://localhost:9200";
  const { db, pg } = createDb(databaseUrl);
  const os = new Client({ node: opensearchUrl });

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
            title: { type: "text", analyzer: "english" },
            body: { type: "text", analyzer: "english" },
            tags: { type: "keyword" },
            owner_id: { type: "keyword" },
            updated_at: { type: "date" },
            acl_group_ids: { type: "keyword" },
            acl_user_ids: { type: "keyword" },
            content_embedding: { type: "keyword", index: false },
          },
        },
      },
    });
    console.log("Created index:", INDEX_NAME);
  }

  const allDocs = await db
    .select()
    .from(documents)
    .where(ne(documents.status, "trashed"));

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
    const aclUserIds = [
      ...new Set([
        doc.ownerId,
        ...docPerm.filter((r) => r.userId).map((r) => r.userId!),
      ]),
    ];

    const searchable = await resolveSearchIndexContent(db, doc);
    const plainText = htmlToPlainText(searchable.body);

    await os.index({
      index: INDEX_NAME,
      id: doc.id,
      body: {
        org_id: doc.orgId,
        document_id: doc.id,
        space_id: doc.spaceId,
        type: doc.type,
        title: searchable.title,
        body: searchable.body,
        tags: doc.tags,
        owner_id: doc.ownerId,
        updated_at: searchable.updatedAt.toISOString(),
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
