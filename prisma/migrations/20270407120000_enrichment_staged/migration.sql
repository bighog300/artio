DO $$ BEGIN
  ALTER TYPE "EnrichmentRunItemStatus" ADD VALUE IF NOT EXISTS 'STAGED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "EnrichmentRunStatus" ADD VALUE IF NOT EXISTS 'STAGED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "EnrichmentRun"
  ADD COLUMN IF NOT EXISTS "dryRun" BOOLEAN NOT NULL DEFAULT false;
