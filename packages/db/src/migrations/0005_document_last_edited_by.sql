ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "last_edited_by" uuid;
--> statement-breakpoint
UPDATE "documents" SET "last_edited_by" = "owner_id" WHERE "last_edited_by" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_last_edited_by_users_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
