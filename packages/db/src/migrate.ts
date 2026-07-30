import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Optional local .env load — production sets DATABASE_URL in the environment. */
async function loadLocalEnv() {
  if (process.env["DATABASE_URL"]) return;
  const envPath = path.resolve(__dirname, "../../../.env");
  if (!existsSync(envPath)) return;
  try {
    const { config } = await import("dotenv");
    config({ path: envPath });
  } catch {
    // dotenv is a local-dev dependency; ignore if missing in production images.
  }
}

async function main() {
  await loadLocalEnv();

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required");

  const migrationsFolder = path.join(__dirname, "../src/migrations");
  if (!existsSync(migrationsFolder)) {
    throw new Error(`Migrations folder not found: ${migrationsFolder}`);
  }

  const pg = postgres(url, { max: 1 });
  const db = drizzle(pg);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
