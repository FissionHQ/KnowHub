import {
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SESClient } from "@aws-sdk/client-ses";
import { eq } from "drizzle-orm";
import pdfParse from "pdf-parse";
import type { Db } from "@wiki/db";
import { attachments, recordAudit, syncDocumentSearchIndex } from "@wiki/db";
import type { PdfProcessingMessage } from "@wiki/types";
import { logger } from "./logger.js";
import { VirusScanner } from "./virusScanner.js";

export class PdfProcessor {
  private virusScanner: VirusScanner;

  constructor(
    private db: Db,
    private s3: S3Client,
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

    await this.db
      .update(attachments)
      .set({ scanStatus: "scanning" })
      .where(eq(attachments.id, attachmentId));

    let pdfText = "";
    let fileBuffer: Buffer;
    const isPdf = originalName.toLowerCase().endsWith(".pdf");

    try {
      const obj = await this.s3.send(
        new GetObjectCommand({ Bucket: this.opts.quarantineBucket, Key: quarantineKey }),
      );

      const chunks: Uint8Array[] = [];
      for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      fileBuffer = Buffer.concat(chunks);

      const scanResult = await this.virusScanner.scan(fileBuffer);
      if (!scanResult.clean) {
        logger.warn("File flagged as infected", { attachmentId, reason: scanResult.reason });
        await this.db
          .update(attachments)
          .set({ scanStatus: "infected" })
          .where(eq(attachments.id, attachmentId));

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

    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.opts.quarantineBucket, Key: quarantineKey }),
    );

    await this.db
      .update(attachments)
      .set({ scanStatus: "clean", s3Key: servedKey })
      .where(eq(attachments.id, attachmentId));

    if (isPdf) {
      await syncDocumentSearchIndex(this.db, documentId, orgId, "upsert", {
        bodyOverride: pdfText,
      });
    }

    await recordAudit(this.db, {
      orgId,
      action: "attachment.scan_result",
      target: { attachmentId, documentId, scanStatus: "clean" },
    });

    logger.info("Attachment processed successfully", { attachmentId, servedKey });
  }

  private isValidPdf(buffer: Buffer): boolean {
    return buffer.slice(0, 4).toString("ascii") === "%PDF";
  }
}
