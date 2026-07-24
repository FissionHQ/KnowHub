const lastEditors = new Map<string, string>();

function docKey(orgId: string, documentId: string): string {
  return `${orgId}:${documentId}`;
}

/** Records the most recent editor for a document (updated on each collab change). */
export function recordLastEditor(
  orgId: string,
  documentId: string,
  userId: string | undefined,
): void {
  if (!userId) return;
  lastEditors.set(docKey(orgId, documentId), userId);
}

/** Clears editor attribution (e.g. on document load before any real edit). */
export function clearLastEditor(orgId: string, documentId: string): void {
  lastEditors.delete(docKey(orgId, documentId));
}

/** Returns the last known editor for version history attribution. */
export function getLastEditor(orgId: string, documentId: string): string | undefined {
  return lastEditors.get(docKey(orgId, documentId));
}
