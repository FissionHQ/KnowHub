ALTER TABLE "documents" ADD COLUMN "draft_title" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_content_ref" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_updated_by" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_draft_updated_by_users_id_fk" FOREIGN KEY ("draft_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Published pages whose live body drifted from the latest snapshot: move WIP into draft_*
-- and restore published columns from the snapshot so readers see the true published version.
WITH latest AS (
  SELECT DISTINCT ON (dv.document_id)
    dv.document_id,
    dv.content_snapshot,
    dv.title_snapshot
  FROM document_versions dv
  ORDER BY dv.document_id, dv.version_number DESC
)
UPDATE documents d
SET
  draft_title = d.title,
  draft_content_ref = d.content_ref,
  draft_updated_at = d.updated_at,
  draft_updated_by = d.owner_id,
  title = latest.title_snapshot,
  content_ref = latest.content_snapshot
FROM latest
WHERE d.id = latest.document_id
  AND d.status = 'published'
  AND d.draft_content_ref IS NULL
  AND (
    coalesce(d.content_ref, '') IS DISTINCT FROM coalesce(latest.content_snapshot, '')
    OR d.title IS DISTINCT FROM latest.title_snapshot
  );
