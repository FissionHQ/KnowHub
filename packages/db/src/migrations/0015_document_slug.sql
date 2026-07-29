ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint

-- Backfill: {slugified-title}-{first-4-hex-of-uuid}
UPDATE "documents"
SET "slug" = trim(both '-' from lower(regexp_replace(coalesce("title", ''), '[^a-zA-Z0-9]+', '-', 'g')))
  || '-' || left(replace("id"::text, '-', ''), 4)
WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint

UPDATE "documents"
SET "slug" = 'page-' || left(replace("id"::text, '-', ''), 4)
WHERE "slug" IS NULL OR "slug" = '' OR "slug" LIKE '-%';--> statement-breakpoint

-- Disambiguate collisions within an org by widening the short id to 8 hex chars
WITH ranked AS (
  SELECT
    id,
    org_id,
    slug,
    row_number() OVER (PARTITION BY org_id, slug ORDER BY created_at ASC, id ASC) AS rn
  FROM documents
)
UPDATE documents d
SET slug = trim(both '-' from lower(regexp_replace(coalesce(d.title, ''), '[^a-zA-Z0-9]+', '-', 'g')))
  || '-' || left(replace(d.id::text, '-', ''), 8)
FROM ranked
WHERE d.id = ranked.id AND ranked.rn > 1;--> statement-breakpoint

ALTER TABLE "documents" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "documents_org_slug_unique" ON "documents" ("org_id", "slug");
