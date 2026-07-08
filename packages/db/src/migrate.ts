import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load root .env when running locally (Turborepo doesn't forward it automatically)
config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required");

  const pg = postgres(url, { max: 1 });
  const db = drizzle(pg);

  console.log("Running migrations...");
  await migrate(db, {
    migrationsFolder: path.join(__dirname, "../src/migrations"),
  });
  console.log("Migrations complete.");

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
