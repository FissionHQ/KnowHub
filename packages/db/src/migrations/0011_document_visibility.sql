CREATE TYPE "public"."document_visibility" AS ENUM('inherit', 'restricted');--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "visibility" "document_visibility" DEFAULT 'inherit' NOT NULL;
