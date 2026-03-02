-- Unified content lifecycle status for Event, Venue, Artist.
DO $$ BEGIN
  CREATE TYPE "ContentStatus" AS ENUM (
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED',
    'CHANGES_REQUESTED',
    'PUBLISHED',
    'ARCHIVED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
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

-- Venue status conversion safeguards.
UPDATE "Venue"
SET "status" = 'DRAFT'
WHERE "status" NOT IN (
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
  'SUBMITTED'
);

ALTER TABLE "Venue"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Venue"
  ALTER COLUMN "status"
  TYPE "ContentStatus"
  USING (
    CASE
      WHEN "status" IS NULL THEN NULL
      WHEN "isPublished" = true THEN 'PUBLISHED'::"ContentStatus"
      WHEN "status" = 'SUBMITTED' THEN 'IN_REVIEW'::"ContentStatus"
      WHEN "status" = 'CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'::"ContentStatus"
      ELSE "status"::text::"ContentStatus"
    END
  );

ALTER TABLE "Venue"
  ALTER COLUMN "status"
  SET DEFAULT 'DRAFT';

-- Event status conversion safeguards.
UPDATE "Event"
SET "status" = 'DRAFT'
WHERE "status" NOT IN (
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
  'SUBMITTED'
);

ALTER TABLE "Event"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Event"
  ALTER COLUMN "status"
  TYPE "ContentStatus"
  USING (
    CASE
      WHEN "status" IS NULL THEN NULL
      WHEN "isPublished" = true THEN 'PUBLISHED'::"ContentStatus"
      WHEN "status" = 'SUBMITTED' THEN 'IN_REVIEW'::"ContentStatus"
      WHEN "status" = 'CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'::"ContentStatus"
      ELSE "status"::text::"ContentStatus"
    END
  );

ALTER TABLE "Event"
  ALTER COLUMN "status"
  SET DEFAULT 'DRAFT';

UPDATE "Artist"
SET "status" = 'PUBLISHED'::"ContentStatus"
WHERE "isPublished" = true;

CREATE INDEX IF NOT EXISTS "Artist_status_idx" ON "Artist"("status");

-- Post-migration verification query snippets for CI / smoke checks.
SELECT "status", COUNT(*) FROM "Venue" GROUP BY "status";
SELECT "status", COUNT(*) FROM "Event" GROUP BY "status";
SELECT "status", COUNT(*) FROM "Artist" GROUP BY "status";
