import { Router } from "express";
import multer from "multer";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import mammoth from "mammoth";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { Db } from "@wiki/db";
import { documents, documentVersions, organizations } from "@wiki/db";
import { ValidationError } from "../../lib/errors.js";
import { assertSpaceAccess } from "../access/permissionResolver.js";
import { recordAudit } from "../../lib/audit.js";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { SearchIndexMessage } from "@wiki/types";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export function createImportRouter(
  db: Db,
  sqs: SQSClient,
  indexQueueUrl: string,
): Router {
  const router = Router();

  async function enqueueIndex(documentId: string, orgId: string) {
    const msg: SearchIndexMessage = { type: "SEARCH_INDEX", documentId, orgId, operation: "upsert" };
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: indexQueueUrl,
        MessageBody: JSON.stringify(msg),
      }),
    );
  }

  // POST /spaces/:spaceId/import/docx — import Word/Google Docx export as wiki page
  router.post(
    "/spaces/:spaceId/import/docx",
    upload.single("file"),
    async (req, res) => {
      const { orgId, userRole, userId, groupIds } = req.tenant;
      const { spaceId } = req.params;

      if (!req.file) throw new ValidationError("No file uploaded");

      const isDocx =
        req.file.mimetype ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        req.file.originalname.toLowerCase().endsWith(".docx");

      if (!isDocx) {
        throw new ValidationError("Only .docx files are supported");
      }

      const orgRows = await db
        .select({ maxFileSizeBytes: organizations.maxFileSizeBytes })
        .from(organizations)
        .where(eq(organizations.id, orgId));
      const maxSize = orgRows[0]?.maxFileSizeBytes ?? 104_857_600;
      if (req.file.size > maxSize) {
        throw new ValidationError(`File exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`);
      }

      await assertSpaceAccess({
        db, userRole, userId, groupIds,
        spaceId: spaceId ?? "",
        required: "edit",
      });

      const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
      const html = result.value || "<p></p>";
      const warnings = result.messages.filter((m) => m.type === "warning").map((m) => m.message);

      const title =
        (req.body?.title as string | undefined)?.trim() ||
        req.file.originalname.replace(/\.docx$/i, "") ||
        "Imported Document";

      const docId = uuidv4();
      const inserted = await db
        .insert(documents)
        .values({
          id: docId,
          orgId,
          spaceId: spaceId ?? "",
          type: "page",
          title,
          contentRef: html,
          ownerId: userId,
          status: "draft",
          version: 1,
          tags: ["imported"],
        })
        .returning();

      await db.insert(documentVersions).values({
        id: uuidv4(),
        documentId: docId,
        versionNumber: 1,
        contentSnapshot: html,
        editedBy: userId,
      });

      await enqueueIndex(docId, orgId);

      await recordAudit(db, {
        orgId,
        actorId: userId,
        action: "document.create",
        target: { documentId: docId, source: "docx-import", filename: req.file.originalname },
        req,
      });

      res.status(201).json({
        data: {
          document: inserted[0],
          warnings,
        },
      });
    },
  );

  return router;
}
