CREATE TABLE IF NOT EXISTS "recently_updated" (
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recently_updated_user_id_document_id_pk" PRIMARY KEY("user_id","document_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recently_updated" ADD CONSTRAINT "recently_updated_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recently_updated" ADD CONSTRAINT "recently_updated_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recently_updated_user_id_idx" ON "recently_updated" USING btree ("user_id");
