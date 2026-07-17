import { eq, and } from "drizzle-orm";
import type { Db } from "@wiki/db";
import { documents, resolveSearchIndexContent } from "@wiki/db";
import type { Client as OpenSearchClient } from "@opensearch-project/opensearch";
import { INDEX_NAME } from "./opensearch.js";
import type { SearchIndexDocument, SearchIndexMessage } from "@wiki/types";
import { logger } from "./logger.js";
import { htmlToPlainText } from "./htmlToPlainText.js";
import { resolveIndexAcl } from "./resolveIndexAcl.js";

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

    const { aclGroupIds, aclUserIds } = await resolveIndexAcl(
      this.db,
      documentId,
      doc.spaceId,
      doc.ownerId,
    );

    const searchable = await resolveSearchIndexContent(this.db, doc);
    let body = searchable.body;

    // Attachment-backed PDFs are indexed by pdfProcessor; avoid wiping extracted text.
    if (doc.type === "pdf" && !doc.contentRef && !body.trim()) {
      try {
        const existing = await this.os.get({ index: INDEX_NAME, id: documentId });
        const existingBody = (existing.body._source as SearchIndexDocument | undefined)?.body;
        if (typeof existingBody === "string" && existingBody.trim()) {
          body = existingBody;
        }
      } catch (err: unknown) {
        const status = (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
        if (status !== 404) throw err;
      }
    }

    const plainText = htmlToPlainText(body);

    const indexDoc: SearchIndexDocument = {
      org_id: orgId,
      document_id: documentId,
      space_id: doc.spaceId,
      type: doc.type,
      title: searchable.title,
      body,
      tags: doc.tags,
      owner_id: doc.ownerId,
      updated_at: searchable.updatedAt.toISOString(),
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
