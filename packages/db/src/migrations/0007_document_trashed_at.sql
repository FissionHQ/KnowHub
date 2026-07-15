ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "trashed_at" timestamptz;
--> statement-breakpoint
UPDATE "documents" SET "trashed_at" = "updated_at" WHERE "status" = 'trashed' AND "trashed_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_trashed_at_idx" ON "documents" ("trashed_at");
