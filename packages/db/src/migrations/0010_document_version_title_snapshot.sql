ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "title_snapshot" text;
--> statement-breakpoint
UPDATE "document_versions" dv
SET "title_snapshot" = d."title"
FROM "documents" d
WHERE dv."document_id" = d."id"
  AND dv."title_snapshot" IS NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "title_snapshot" SET NOT NULL;
