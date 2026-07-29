import { and, eq, ne, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { documents } from "./schema.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDocumentUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** First 4 hex chars of a UUID (no dashes) — stable short suffix for URLs. */
export function documentShortId(documentId: string, length = 4): string {
  return documentId.replace(/-/g, "").slice(0, length).toLowerCase();
}

/** Lowercase URL slug from a document title. */
export function slugifyDocumentTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "page";
}

/** Build `{title-slug}-{shortId}` (e.g. api-authentication-8f2d). */
export function buildDocumentSlug(
  title: string,
  documentId: string,
  shortLength = 4,
): string {
  return `${slugifyDocumentTitle(title)}-${documentShortId(documentId, shortLength)}`;
}

/** Pick a unique slug for an org; widen short id on collision. */
export async function allocateDocumentSlug(
  db: Db,
  orgId: string,
  title: string,
  documentId: string,
  excludeDocumentId?: string,
): Promise<string> {
  for (const shortLength of [4, 8, 12, 32] as const) {
    const candidate = buildDocumentSlug(title, documentId, shortLength);
    const conditions = [eq(documents.orgId, orgId), eq(documents.slug, candidate)];
    if (excludeDocumentId) conditions.push(ne(documents.id, excludeDocumentId));

    const rows = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(...conditions))
      .limit(1);

    if (!rows.length) return candidate;
  }

  // Extremely unlikely: full uuid hex still collided on title+id slug.
  return `${slugifyDocumentTitle(title)}-${documentId.replace(/-/g, "")}`;
}

/** Resolve a document by UUID, exact slug, or short-id suffix within an org. */
export async function findDocumentByRef(db: Db, orgId: string, ref: string) {
  if (isDocumentUuid(ref)) {
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, orgId), eq(documents.id, ref)))
      .limit(1);
    return rows[0] ?? null;
  }

  const bySlug = await db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.slug, ref)))
    .limit(1);
  if (bySlug[0]) return bySlug[0];

  // Title may have changed; match stable short-id suffix (…-8f2d).
  const match = ref.match(/-([a-f0-9]{4,32})$/i);
  if (!match) return null;
  const shortId = match[1]!.toLowerCase();

  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        sql`left(replace(${documents.id}::text, '-', ''), ${shortId.length}) = ${shortId}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
