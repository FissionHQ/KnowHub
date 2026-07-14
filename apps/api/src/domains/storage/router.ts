import { Router } from "express";
import multer from "multer";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { Db } from "@wiki/db";
import { attachments, documents, organizations } from "@wiki/db";
import { NotFoundError, ForbiddenError, ValidationError } from "../../lib/errors.js";
import { assertDocumentAccess, assertSpaceAccess } from "../access/permissionResolver.js";
import type { S3Client } from "@aws-sdk/client-s3";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { PdfProcessingMessage } from "@wiki/types";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB hard cap; per-org limit enforced in handler
});

export function createStorageRouter(
  db: Db,
  s3: S3Client,
  sqs: SQSClient,
  opts: {
    quarantineBucket: string;
    servedBucket: string;
    pdfQueueUrl: string;
    presignedUrlTtl?: number;
  },
): Router {
  const router = Router();
  const PRESIGN_TTL = opts.presignedUrlTtl ?? 300; // 5 minutes

  // POST /documents/:documentId/attachments — upload file
  router.post(
    "/documents/:documentId/attachments",
    upload.single("file"),
    async (req, res) => {
      const { orgId, userRole, userId, groupIds } = req.tenant;
      const { documentId } = req.params;

      if (!req.file) throw new ValidationError("No file uploaded");

      // Enforce per-org file size limit (PDF-2)
      let maxSize = 104_857_600; // 100MB default
      try {
        const orgRows = await db.select({ maxFileSizeBytes: organizations.maxFileSizeBytes }).from(organizations).where(eq(organizations.id, orgId));
        if (orgRows[0]?.maxFileSizeBytes) maxSize = orgRows[0].maxFileSizeBytes;
      } catch { /* column may not exist yet */ }
      if (req.file.size > maxSize) {
        throw new ValidationError(`File exceeds maximum allowed size of ${Math.round(maxSize / 1_048_576)}MB`);
      }

      const rows = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

      if (!rows.length) throw new NotFoundError("Document");
      const doc = rows[0]!;

      await assertDocumentAccess({
        db, userRole, userId, groupIds,
        documentId: doc.id,
        spaceId: doc.spaceId,
        required: "edit",
      });

      const attachmentId = uuidv4();
      const quarantineKey = `quarantine/${orgId}/${attachmentId}/${req.file.originalname}`;

      // Upload to quarantine bucket
      await s3.send(
        new PutObjectCommand({
          Bucket: opts.quarantineBucket,
          Key: quarantineKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
          Metadata: {
            "x-org-id": orgId,
            "x-attachment-id": attachmentId,
          },
        }),
      );

      // Record attachment in DB (pending scan)
      await db.insert(attachments).values({
        id: attachmentId,
        orgId,
        documentId: documentId ?? "",
        originalName: req.file.originalname,
        quarantineKey,
        fileType: req.file.mimetype,
        sizeBytes: req.file.size,
        scanStatus: "pending",
      });

      // Enqueue for scan + processing
      const msg: PdfProcessingMessage = {
        type: "PDF_PROCESSING",
        attachmentId,
        documentId: documentId ?? "",
        orgId,
        quarantineKey,
        originalName: req.file.originalname,
        sizeBytes: req.file.size,
      };
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: opts.pdfQueueUrl,
          MessageBody: JSON.stringify(msg),
        }),
      ).catch(() => null);

      res.status(202).json({ data: { attachmentId, status: "pending" } });
    },
  );

  // POST /documents/:documentId/attachments/replace — replace PDF (PDF-7)
  router.post(
    "/documents/:documentId/attachments/replace",
    upload.single("file"),
    async (req, res) => {
      const { orgId, userRole, userId, groupIds } = req.tenant;
      const { documentId } = req.params;

      if (!req.file) throw new ValidationError("No file uploaded");

      const rows = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));

      if (!rows.length) throw new NotFoundError("Document");
      const doc = rows[0]!;

      await assertDocumentAccess({
        db, userRole, userId, groupIds,
        documentId: doc.id,
        spaceId: doc.spaceId,
        required: "edit",
      });

      // Increment document version
      const newVersion = doc.version + 1;
      await db
        .update(documents)
        .set({ version: newVersion, updatedAt: new Date() })
        .where(eq(documents.id, documentId ?? ""));

      const attachmentId = uuidv4();
      const quarantineKey = `quarantine/${orgId}/${attachmentId}/${req.file.originalname}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: opts.quarantineBucket,
          Key: quarantineKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
          Metadata: { "x-org-id": orgId, "x-attachment-id": attachmentId },
        }),
      );

      await db.insert(attachments).values({
        id: attachmentId,
        orgId,
        documentId: documentId ?? "",
        originalName: req.file.originalname,
        quarantineKey,
        fileType: req.file.mimetype,
        sizeBytes: req.file.size,
        scanStatus: "pending",
      });

      const msg: PdfProcessingMessage = {
        type: "PDF_PROCESSING",
        attachmentId,
        documentId: documentId ?? "",
        orgId,
        quarantineKey,
        originalName: req.file.originalname,
        sizeBytes: req.file.size,
      };
      await sqs.send(
        new SendMessageCommand({ QueueUrl: opts.pdfQueueUrl, MessageBody: JSON.stringify(msg) }),
      ).catch(() => null);

      res.status(202).json({ data: { attachmentId, version: newVersion, status: "pending" } });
    },
  );

  // GET /attachments/:attachmentId/status
  router.get("/attachments/:attachmentId/status", async (req, res) => {
    const { orgId } = req.tenant;
    const { attachmentId } = req.params;

    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, attachmentId ?? ""), eq(attachments.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Attachment");
    const att = rows[0]!;

    res.json({
      data: {
        attachmentId: att.id,
        scanStatus: att.scanStatus,
        ...(att.s3Key ? { ready: true } : { ready: false }),
      },
    });
  });

  // GET /attachments/:attachmentId/view — generate presigned URL
  router.get("/attachments/:attachmentId/view", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { attachmentId } = req.params;

    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, attachmentId ?? ""), eq(attachments.orgId, orgId)));

    if (!rows.length) throw new NotFoundError("Attachment");
    const att = rows[0]!;

    if (att.scanStatus !== "clean" || !att.s3Key) {
      throw new ValidationError("Attachment is not available for viewing yet");
    }

    // Verify user can view the parent document
    const docRows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, att.documentId), eq(documents.orgId, orgId)));

    if (!docRows.length) throw new NotFoundError("Document");
    const doc = docRows[0]!;

    await assertDocumentAccess({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    // Generate presigned URL — ACL check done above, URL is short-lived
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: opts.servedBucket,
        Key: att.s3Key,
        ResponseContentDisposition: `inline; filename="${att.originalName}"`,
        ResponseContentType: att.fileType,
      }),
      { expiresIn: PRESIGN_TTL },
    );

    res.json({ data: { url, expiresIn: PRESIGN_TTL } });
  });

  return router;
}
