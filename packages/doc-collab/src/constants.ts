export const COLLAB_FIELD = "default";

/** Redis pub/sub channel — API publishes, collab server unloads in-memory documents. */
export const COLLAB_DOCUMENT_RESET_CHANNEL = "collab:document-reset";

export function collabDocumentName(orgId: string, documentId: string): string {
  return `${orgId}:${documentId}`;
}
