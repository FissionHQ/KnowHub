import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@opensearch-project/opensearch";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, ne } from "drizzle-orm";
import { documents, spacePermissions, documentPermissions } from "./schema.js";

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
  const pg = postgres(databaseUrl, { max: 1 });
  const db = drizzle(pg);
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

    await os.index({
      index: INDEX_NAME,
      id: doc.id,
      body: {
        org_id: doc.orgId,
        document_id: doc.id,
        space_id: doc.spaceId,
        type: doc.type,
        title: doc.title,
        body: doc.type === "page" ? htmlToPlainText(doc.contentRef ?? "") : (doc.contentRef ?? ""),
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
