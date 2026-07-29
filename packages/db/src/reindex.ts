import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ne } from "drizzle-orm";
import { createDb, documents, syncDocumentSearchIndex } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const { db, pg } = createDb(databaseUrl);

  const allDocs = await db
    .select({ id: documents.id, orgId: documents.orgId, title: documents.title })
    .from(documents)
    .where(ne(documents.status, "trashed"));

  console.log(`Found ${allDocs.length} documents to index`);

  let indexed = 0;
  for (const doc of allDocs) {
    await syncDocumentSearchIndex(db, doc.id, doc.orgId, "upsert");
    indexed++;
    console.log(`Indexed: ${doc.title} (${doc.id})`);
  }

  console.log(`Done! Indexed ${indexed} documents.`);
  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
