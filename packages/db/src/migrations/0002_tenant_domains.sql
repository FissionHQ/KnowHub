DO $$ BEGIN
  CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "status" "org_status" DEFAULT 'active' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_domains_org_id_idx" ON "organization_domains" USING btree ("org_id");
