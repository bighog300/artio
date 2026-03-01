-- Unified content lifecycle status for Event, Venue, Artist.
DO $$ BEGIN
  CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

ALTER TABLE "Venue"
  ALTER COLUMN "status" TYPE "ContentStatus"
  USING CASE
    WHEN "isPublished" = true THEN 'PUBLISHED'::"ContentStatus"
    WHEN "status" = 'SUBMITTED' THEN 'IN_REVIEW'::"ContentStatus"
    WHEN "status" = 'REJECTED' THEN 'CHANGES_REQUESTED'::"ContentStatus"
    WHEN "status" = 'APPROVED' THEN 'PUBLISHED'::"ContentStatus"
    WHEN "status" = 'ARCHIVED' THEN 'ARCHIVED'::"ContentStatus"
    ELSE 'DRAFT'::"ContentStatus"
  END;

ALTER TABLE "Event"
  ALTER COLUMN "status" TYPE "ContentStatus"
  USING CASE
    WHEN "isPublished" = true THEN 'PUBLISHED'::"ContentStatus"
    WHEN "status" = 'SUBMITTED' THEN 'IN_REVIEW'::"ContentStatus"
    WHEN "status" = 'REJECTED' THEN 'CHANGES_REQUESTED'::"ContentStatus"
    WHEN "status" = 'APPROVED' THEN 'PUBLISHED'::"ContentStatus"
    WHEN "status" = 'ARCHIVED' THEN 'ARCHIVED'::"ContentStatus"
    ELSE 'DRAFT'::"ContentStatus"
  END;

UPDATE "Artist"
SET "status" = 'PUBLISHED'::"ContentStatus"
WHERE "isPublished" = true;

CREATE INDEX IF NOT EXISTS "Artist_status_idx" ON "Artist"("status");
