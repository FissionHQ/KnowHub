ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "can_manage_groups" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "groups"
    ADD CONSTRAINT "groups_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
