-- Add pptx document type (attachment-backed viewer or converted HTML page)
DO $$ BEGIN
  ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'pptx';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
