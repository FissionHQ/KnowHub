ALTER TABLE "spaces" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint

-- Backfill from name: lowercase, non-alnum → hyphen, trim hyphens
UPDATE "spaces"
SET "slug" = trim(both '-' from lower(regexp_replace(coalesce("name", ''), '[^a-zA-Z0-9]+', '-', 'g')))
WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint

UPDATE "spaces"
SET "slug" = 'space'
WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint

-- Disambiguate collisions within an org (keep first by created_at, suffix others)
WITH ranked AS (
  SELECT
    id,
    org_id,
    slug,
    row_number() OVER (PARTITION BY org_id, slug ORDER BY created_at ASC, id ASC) AS rn
  FROM spaces
)
UPDATE spaces s
SET slug = s.slug || '-' || ranked.rn
FROM ranked
WHERE s.id = ranked.id AND ranked.rn > 1;--> statement-breakpoint

ALTER TABLE "spaces" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "spaces_org_slug_unique" ON "spaces" ("org_id", "slug");
