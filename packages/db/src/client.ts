import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _pg: ReturnType<typeof postgres> | null = null;

export function createDb(connectionString: string) {
  const pg = postgres(connectionString, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  return {
    db: drizzle(pg, { schema }),
    pg,
  };
}

export function getDb(connectionString: string) {
  if (!_db || !_pg) {
    const { db, pg } = createDb(connectionString);
    _db = db;
    _pg = pg;
  }
  return _db;
}

export async function closeDb() {
  if (_pg) {
    await _pg.end();
    _pg = null;
    _db = null;
  }
}

export type Db = ReturnType<typeof createDb>["db"];
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | DbTransaction;
