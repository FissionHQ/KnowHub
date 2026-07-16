import {
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { eq, and } from "drizzle-orm";
import pdfParse from "pdf-parse";
import type { Db } from "@wiki/db";
import { attachments, documents, recordAudit } from "@wiki/db";
import type { Client as OpenSearchClient } from "@opensearch-project/opensearch";
import { INDEX_NAME } from "./opensearch.js";
import type { PdfProcessingMessage, SearchIndexDocument } from "@wiki/types";
import { logger } from "./logger.js";
import { VirusScanner } from "./virusScanner.js";
import { resolveIndexAcl } from "./resolveIndexAcl.js";

export class PdfProcessor {
  private virusScanner: VirusScanner;

  constructor(
    private db: Db,
    private s3: S3Client,
    private os: OpenSearchClient,
    private ses: SESClient,
    private opts: {
      quarantineBucket: string;
      servedBucket: string;
      sesFromAddress: string;
      clamavHost: string;
      clamavPort: number;
    },
  ) {
    this.virusScanner = new VirusScanner(opts.clamavHost, opts.clamavPort);
  }

  async process(msg: PdfProcessingMessage): Promise<void> {
    const { attachmentId, documentId, orgId, quarantineKey, originalName } = msg;

    logger.info("Processing attachment", { attachmentId, documentId, originalName });

    // Update status to scanning
    await this.db
      .update(attachments)
      .set({ scanStatus: "scanning" })
      .where(eq(attachments.id, attachmentId));

    let pdfText = "";
    let fileBuffer: Buffer;
    const isPdf = originalName.toLowerCase().endsWith(".pdf");

    try {
      // Fetch file from quarantine
      const obj = await this.s3.send(
        new GetObjectCommand({ Bucket: this.opts.quarantineBucket, Key: quarantineKey }),
      );

      const chunks: Uint8Array[] = [];
      for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      fileBuffer = Buffer.concat(chunks);

      // PDF-8: Virus/malware scanning
      const scanResult = await this.virusScanner.scan(fileBuffer);
      if (!scanResult.clean) {
        logger.warn("File flagged as infected", { attachmentId, reason: scanResult.reason });
        await this.db
          .update(attachments)
          .set({ scanStatus: "infected" })
          .where(eq(attachments.id, attachmentId));

        // Delete infected file from quarantine
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.opts.quarantineBucket, Key: quarantineKey }),
        );

        await recordAudit(this.db, {
          orgId,
          action: "attachment.scan_result",
          target: { attachmentId, documentId, scanStatus: "infected", reason: scanResult.reason },
        });
        return;
      }

      logger.info("Virus scan passed", { attachmentId });

      if (isPdf) {
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

      await recordAudit(this.db, {
        orgId,
        action: "attachment.scan_result",
        target: { attachmentId, documentId, scanStatus: "error" },
      });
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

    // Generate thumbnail (PDF-9) — store first page text snippet as metadata
    // Full image thumbnail would require canvas/sharp; we store a text preview for listings
    const thumbnailKey = `thumbnails/${orgId}/${attachmentId}.txt`;
    const preview = pdfText.slice(0, 500).replace(/\s+/g, " ").trim();
    if (preview) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.opts.servedBucket,
          Key: thumbnailKey,
          Body: preview,
          ContentType: "text/plain",
          Metadata: { "x-org-id": orgId, "x-document-id": documentId },
        }),
      );
    }

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
    await recordAudit(this.db, {
      orgId,
      action: "attachment.scan_result",
      target: { attachmentId, documentId, scanStatus: "clean" },
    });

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

    // Resolve ACL and index
    const { aclGroupIds, aclUserIds } = await resolveIndexAcl(
      this.db,
      documentId,
      doc.spaceId,
      doc.ownerId,
    );

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
      preview: pdfText.slice(0, 300).replace(/\s+/g, " ").trim() || null,
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
