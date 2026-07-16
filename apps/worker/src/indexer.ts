import { eq, and } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { documents, spacePermissions, documentPermissions } from "@wiki/db";
import type { Client as OpenSearchClient } from "@opensearch-project/opensearch";
import { INDEX_NAME } from "./opensearch.js";
import type { SearchIndexDocument, SearchIndexMessage } from "@wiki/types";
import { logger } from "./logger.js";

export class Indexer {
  constructor(
    private db: Db,
    private os: OpenSearchClient,
  ) {}

  async handle(msg: SearchIndexMessage): Promise<void> {
    const { documentId, orgId, operation } = msg;

    if (operation === "delete") {
      try {
        await this.os.delete({ index: INDEX_NAME, id: documentId, refresh: "wait_for" });
      } catch (err: unknown) {
        const status = (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
        if (status !== 404) throw err;
      }
      logger.info("Document removed from index", { documentId });
      return;
    }

    const rows = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));

    if (!rows.length) {
      logger.warn("Document not found for indexing", { documentId });
      return;
    }
    const doc = rows[0]!;

    if (doc.status === "trashed") {
      await this.os.delete({ index: INDEX_NAME, id: documentId, refresh: "wait_for" });
      logger.info("Trashed document kept out of index", { documentId });
      return;
    }

    const spacePerm = await this.db
      .select({ groupId: spacePermissions.groupId })
      .from(spacePermissions)
      .where(eq(spacePermissions.spaceId, doc.spaceId));

    const docPerm = await this.db
      .select({ groupId: documentPermissions.groupId, userId: documentPermissions.userId })
      .from(documentPermissions)
      .where(eq(documentPermissions.documentId, documentId));

    const aclGroupIds = [
      ...new Set([
        ...spacePerm.map((r) => r.groupId),
        ...docPerm.filter((r) => r.groupId).map((r) => r.groupId!),
      ]),
    ];
    const aclUserIds = docPerm.filter((r) => r.userId).map((r) => r.userId!);

    const body = doc.contentRef ?? "";
    // Strip HTML tags for preview text
    const plainText = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const indexDoc: SearchIndexDocument = {
      org_id: orgId,
      document_id: documentId,
      space_id: doc.spaceId,
      type: doc.type,
      title: doc.title,
      body,
      tags: doc.tags,
      owner_id: doc.ownerId,
      updated_at: doc.updatedAt.toISOString(),
      acl_group_ids: aclGroupIds,
      acl_user_ids: aclUserIds,
      preview: plainText.slice(0, 300) || null,
      content_embedding: null,
    };

    await this.os.index({
      index: INDEX_NAME,
      id: documentId,
      body: indexDoc,
      refresh: "wait_for",
    });

    logger.info("Document indexed", { documentId, orgId });
  }
}
