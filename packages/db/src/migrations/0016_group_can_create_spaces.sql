ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "can_create_spaces" boolean DEFAULT false NOT NULL;
