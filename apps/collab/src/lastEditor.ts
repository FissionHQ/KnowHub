import type { Redis } from "ioredis";

const TTL_SEC = 3600;

function docKey(orgId: string, documentId: string): string {
  return `collab:lastEditor:${orgId}:${documentId}`;
}

/** Records the most recent editor for a document (updated on each collab change). */
export function recordLastEditor(
  redis: Redis,
  orgId: string,
  documentId: string,
  userId: string | undefined,
): void {
  if (!userId) return;
  void redis.set(docKey(orgId, documentId), userId, "EX", TTL_SEC);
}

/** Clears editor attribution (e.g. on document load before any real edit). */
export function clearLastEditor(redis: Redis, orgId: string, documentId: string): void {
  void redis.del(docKey(orgId, documentId));
}

/** Returns the last known editor for version history attribution. */
export async function getLastEditor(
  redis: Redis,
  orgId: string,
  documentId: string,
): Promise<string | undefined> {
  const value = await redis.get(docKey(orgId, documentId));
  return value ?? undefined;
}
