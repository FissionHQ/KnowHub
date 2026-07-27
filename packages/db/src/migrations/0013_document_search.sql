CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_title" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_body" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_preview" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_updated_at" timestamp with time zone;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_is_editable" boolean DEFAULT true NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_acl_group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_acl_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

CREATE INDEX IF NOT EXISTS "documents_search_vector_gin" ON "documents" USING gin ("search_vector");
CREATE INDEX IF NOT EXISTS "documents_search_title_trgm" ON "documents" USING gin ("search_title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "documents_search_acl_groups_gin" ON "documents" USING gin ("search_acl_group_ids");
CREATE INDEX IF NOT EXISTS "documents_search_acl_users_gin" ON "documents" USING gin ("search_acl_user_ids");
CREATE INDEX IF NOT EXISTS "documents_org_status_idx" ON "documents" ("org_id", "status");
