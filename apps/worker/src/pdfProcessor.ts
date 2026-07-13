import {
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { eq, and } from "drizzle-orm";
import pdfParse from "pdf-parse";
import type { Db } from "@wiki/db";
import { attachments, documents, documentPermissions, spacePermissions, groupMemberships } from "@wiki/db";
import type { Client as OpenSearchClient } from "@opensearch-project/opensearch";
import { INDEX_NAME } from "./opensearch.js";
import type { PdfProcessingMessage, SearchIndexDocument } from "@wiki/types";
import { logger } from "./logger.js";

export class PdfProcessor {
  constructor(
    private db: Db,
    private s3: S3Client,
    private os: OpenSearchClient,
    private ses: SESClient,
    private opts: {
      quarantineBucket: string;
      servedBucket: string;
      sesFromAddress: string;
    },
  ) {}

  async process(msg: PdfProcessingMessage): Promise<void> {
    const { attachmentId, documentId, orgId, quarantineKey, originalName } = msg;

    logger.info("Processing attachment", { attachmentId, documentId, originalName });

    // Update status to scanning
    await this.db
      .update(attachments)
      .set({ scanStatus: "scanning" })
      .where(eq(attachments.id, attachmentId));

    let pdfText = "";
    const isPdf = originalName.toLowerCase().endsWith(".pdf");

    try {
      if (isPdf) {
        // Fetch from quarantine for PDF text extraction
        const obj = await this.s3.send(
          new GetObjectCommand({ Bucket: this.opts.quarantineBucket, Key: quarantineKey }),
        );

        const chunks: Uint8Array[] = [];
        for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const fileBuffer = Buffer.concat(chunks);

        if (!this.isValidPdf(fileBuffer)) {
          throw new Error("File does not appear to be a valid PDF");
        }

        try {
          const parsed = await pdfParse(fileBuffer);
          pdfText = parsed.text;
        } catch (err) {
          logger.warn("PDF text extraction failed (continuing with empty text)", { err });
        }
      }
    } catch (err) {
      logger.error("Attachment processing failed — marking as error", { attachmentId, err });
      await this.db
        .update(attachments)
        .set({ scanStatus: "error" })
        .where(eq(attachments.id, attachmentId));
      return;
    }

    // Promote to served bucket
    const servedKey = `served/${orgId}/${attachmentId}/${originalName}`;
    await this.s3.send(
      new CopyObjectCommand({
        CopySource: `${this.opts.quarantineBucket}/${quarantineKey}`,
        Bucket: this.opts.servedBucket,
        Key: servedKey,
        MetadataDirective: "REPLACE",
        Metadata: { "x-org-id": orgId, "x-attachment-id": attachmentId },
      }),
    );

    // Delete from quarantine
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.opts.quarantineBucket, Key: quarantineKey }),
    );

    // Update attachment record
    await this.db
      .update(attachments)
      .set({ scanStatus: "clean", s3Key: servedKey })
      .where(eq(attachments.id, attachmentId));

    // Index in OpenSearch
    if (isPdf) {
      await this.indexDocument(documentId, orgId, pdfText, attachmentId);
    }

    logger.info("Attachment processed successfully", { attachmentId, servedKey });
  }

  private async indexDocument(
    documentId: string,
    orgId: string,
    pdfText: string,
    attachmentId: string,
  ): Promise<void> {
    const docRows = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));

    if (!docRows.length) return;
    const doc = docRows[0]!;

    // Resolve ACL group IDs from space permissions
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

    const indexDoc: SearchIndexDocument = {
      org_id: orgId,
      document_id: documentId,
      space_id: doc.spaceId,
      type: "pdf",
      title: doc.title,
      body: pdfText,
      tags: doc.tags,
      owner_id: doc.ownerId,
      updated_at: doc.updatedAt.toISOString(),
      acl_group_ids: aclGroupIds,
      acl_user_ids: aclUserIds,
      content_embedding: null,
    };

    await this.os.index({
      index: INDEX_NAME,
      id: documentId,
      body: indexDoc,
      refresh: "wait_for",
    });
  }

  private isValidPdf(buffer: Buffer): boolean {
    return buffer.slice(0, 4).toString("ascii") === "%PDF";
  }
}
