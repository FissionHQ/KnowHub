import { Router } from "express";
import multer from "multer";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { Db } from "@wiki/db";
import { attachments, documents, organizations } from "@wiki/db";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { assertDocumentAccess, assertSpaceAccess } from "../access/permissionResolver.js";
import { recordAudit } from "../../lib/audit.js";
import type { S3Client } from "@aws-sdk/client-s3";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { S3_SERVER_SIDE_ENCRYPTION } from "@wiki/config";
import type { PdfProcessingMessage } from "@wiki/types";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

async function getOrgMaxFileSize(db: Db, orgId: string): Promise<number> {
  const rows = await db
    .select({ maxFileSizeBytes: organizations.maxFileSizeBytes })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return rows[0]?.maxFileSizeBytes ?? 104_857_600;
}

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
  const PRESIGN_TTL = opts.presignedUrlTtl ?? 300;

  async function enqueuePdfProcessing(msg: PdfProcessingMessage) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: opts.pdfQueueUrl,
        MessageBody: JSON.stringify(msg),
      }),
    );
  }

  // POST /spaces/:spaceId/upload/pdf — create PDF document + upload file
  router.post(
    "/spaces/:spaceId/upload/pdf",
    upload.single("file"),
    async (req, res) => {
      const { orgId, userRole, userId, groupIds } = req.tenant;
      const { spaceId } = req.params;

      if (!req.file) throw new ValidationError("No file uploaded");
      if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
        throw new ValidationError("Only PDF files are allowed");
      }

      const maxSize = await getOrgMaxFileSize(db, orgId);
      if (req.file.size > maxSize) {
        throw new ValidationError(`File exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`);
      }

      await assertSpaceAccess({
        db, userRole, userId, groupIds,
        spaceId: spaceId ?? "",
        required: "edit",
      });

      const title =
        (req.body?.title as string | undefined)?.trim() ||
        req.file.originalname.replace(/\.pdf$/i, "") ||
        "Untitled PDF";

      const docId = uuidv4();
      const attachmentId = uuidv4();
      const quarantineKey = `quarantine/${orgId}/${attachmentId}/${req.file.originalname}`;

      await db.insert(documents).values({
        id: docId,
        orgId,
        spaceId: spaceId ?? "",
        type: "pdf",
        title,
        contentRef: null,
        ownerId: userId,
        status: "published",
        version: 1,
        tags: [],
      });

      await s3.send(
        new PutObjectCommand({
          Bucket: opts.quarantineBucket,
          Key: quarantineKey,
          Body: req.file.buffer,
          ContentType: "application/pdf",
          ServerSideEncryption: S3_SERVER_SIDE_ENCRYPTION,
          Metadata: { "x-org-id": orgId, "x-attachment-id": attachmentId },
        }),
      );

      await db.insert(attachments).values({
        id: attachmentId,
        orgId,
        documentId: docId,
        originalName: req.file.originalname,
        quarantineKey,
        fileType: "application/pdf",
        sizeBytes: req.file.size,
        scanStatus: "pending",
      });

      await enqueuePdfProcessing({
        type: "PDF_PROCESSING",
        attachmentId,
        documentId: docId,
        orgId,
        quarantineKey,
        originalName: req.file.originalname,
        sizeBytes: req.file.size,
      });

      await recordAudit(db, {
        orgId,
        actorId: userId,
        action: "attachment.upload",
        target: { documentId: docId, attachmentId, type: "pdf" },
        req,
      });

      res.status(201).json({
        data: { documentId: docId, attachmentId, status: "pending" },
      });
    },
  );

  // POST /upload/image — inline editor image upload
  router.post("/upload/image", upload.single("file"), async (req, res) => {
    const { orgId } = req.tenant;
    if (!req.file) throw new ValidationError("No file uploaded");
    if (!req.file.mimetype.startsWith("image/")) {
      throw new ValidationError("Only image files are allowed");
    }

    const maxSize = await getOrgMaxFileSize(db, orgId);
    if (req.file.size > maxSize) {
      throw new ValidationError(`File exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    const imageId = uuidv4();
    const servedKey = `images/${orgId}/${imageId}/${req.file.originalname}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: opts.servedBucket,
        Key: servedKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ServerSideEncryption: S3_SERVER_SIDE_ENCRYPTION,
      }),
    );

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: opts.servedBucket, Key: servedKey }),
      { expiresIn: 3600 },
    );

    res.status(201).json({ data: { url, key: servedKey } });
  });

  // GET /documents/:documentId/attachments
  router.get("/documents/:documentId/attachments", async (req, res) => {
    const { orgId, userRole, userId, groupIds } = req.tenant;
    const { documentId } = req.params;

    const docRows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId ?? ""), eq(documents.orgId, orgId)));
    if (!docRows.length) throw new NotFoundError("Document");
    const doc = docRows[0]!;

    await assertDocumentAccess({
      db, userRole, userId, groupIds,
      documentId: doc.id,
      spaceId: doc.spaceId,
      required: "view",
    });

    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.documentId, documentId ?? ""), eq(attachments.orgId, orgId)))
      .orderBy(desc(attachments.createdAt));

    res.json({ data: rows });
  });

  // POST /documents/:documentId/attachments — upload file to existing document
  router.post(
    "/documents/:documentId/attachments",
    upload.single("file"),
    async (req, res) => {
      const { orgId, userRole, userId, groupIds } = req.tenant;
      const { documentId } = req.params;

      if (!req.file) throw new ValidationError("No file uploaded");

      const maxSize = await getOrgMaxFileSize(db, orgId);
      if (req.file.size > maxSize) {
        throw new ValidationError(`File exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`);
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

      await s3.send(
        new PutObjectCommand({
          Bucket: opts.quarantineBucket,
          Key: quarantineKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
          ServerSideEncryption: S3_SERVER_SIDE_ENCRYPTION,
          Metadata: {
            "x-org-id": orgId,
            "x-attachment-id": attachmentId,
          },
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
      await enqueuePdfProcessing(msg);

      res.status(202).json({ data: { attachmentId, status: "pending" } });
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
