import { and, eq, ne } from "drizzle-orm";
import type { Db } from "./client.js";
import { spaces } from "./schema.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSpaceUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Lowercase URL slug from a display name. */
export function slugifySpaceName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "space";
}

/** Pick a unique slug for an org, appending -2, -3, … on collision. */
export async function allocateSpaceSlug(
  db: Db,
  orgId: string,
  name: string,
  excludeSpaceId?: string,
): Promise<string> {
  const base = slugifySpaceName(name);
  let candidate = base;
  let n = 2;

  for (;;) {
    const conditions = [eq(spaces.orgId, orgId), eq(spaces.slug, candidate)];
    if (excludeSpaceId) conditions.push(ne(spaces.id, excludeSpaceId));

    const rows = await db
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(...conditions))
      .limit(1);

    if (!rows.length) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

/** Resolve a space by UUID or slug within an org. */
export async function findSpaceByRef(db: Db, orgId: string, ref: string) {
  const rows = await db
    .select()
    .from(spaces)
    .where(
      and(
        eq(spaces.orgId, orgId),
        isSpaceUuid(ref) ? eq(spaces.id, ref) : eq(spaces.slug, ref),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
