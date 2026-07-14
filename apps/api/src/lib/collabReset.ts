import type { Redis } from "ioredis";
import { COLLAB_DOCUMENT_RESET_CHANNEL } from "@wiki/doc-collab";

export async function notifyCollabDocumentReset(
  redis: Redis,
  orgId: string,
  documentId: string,
): Promise<void> {
  await redis.publish(
    COLLAB_DOCUMENT_RESET_CHANNEL,
    JSON.stringify({ orgId, documentId }),
  );
}
