ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "audit_retention_days" integer DEFAULT 365 NOT NULL;
