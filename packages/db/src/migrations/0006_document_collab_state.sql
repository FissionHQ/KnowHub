ALTER TABLE "documents" DROP COLUMN IF EXISTS "last_edited_by";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_collab_state" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"state" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_collab_state" ADD CONSTRAINT "document_collab_state_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_collab_state" ADD CONSTRAINT "document_collab_state_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_collab_state_org_id_idx" ON "document_collab_state" USING btree ("org_id");
