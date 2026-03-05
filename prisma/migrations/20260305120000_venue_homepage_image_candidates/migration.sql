-- Ensure dependencies exist when applying from a fresh database.
CREATE TABLE IF NOT EXISTS "VenueGenerationRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "totalReturned" INTEGER NOT NULL,
    "totalCreated" INTEGER NOT NULL,
    "totalSkipped" INTEGER NOT NULL,
    "triggeredById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "VenueGenerationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VenueGenerationRunItem" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "venueId" UUID,
    "geocodeStatus" TEXT NOT NULL DEFAULT 'not_attempted',
    "geocodeErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VenueGenerationRunItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VenueGenerationRunItem"
  ADD COLUMN IF NOT EXISTS "homepageImageStatus" TEXT NOT NULL DEFAULT 'skipped',
  ADD COLUMN IF NOT EXISTS "homepageImageCandidateCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "VenueHomepageImageCandidate" (
  "id" UUID NOT NULL,
  "venueId" UUID NOT NULL,
  "runItemId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "selectedAt" TIMESTAMPTZ,
  "selectedById" UUID,
  "venueImageId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VenueHomepageImageCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VenueGenerationRun_createdAt_idx" ON "VenueGenerationRun"("createdAt");
CREATE INDEX IF NOT EXISTS "VenueGenerationRunItem_runId_status_idx" ON "VenueGenerationRunItem"("runId", "status");
CREATE INDEX IF NOT EXISTS "VenueGenerationRunItem_runId_geocodeStatus_idx" ON "VenueGenerationRunItem"("runId", "geocodeStatus");
CREATE INDEX IF NOT EXISTS "VenueGenerationRunItem_venueId_idx" ON "VenueGenerationRunItem"("venueId");
CREATE INDEX IF NOT EXISTS "VenueGenerationRunItem_createdAt_idx" ON "VenueGenerationRunItem"("createdAt");
CREATE INDEX IF NOT EXISTS "VenueHomepageImageCandidate_venueId_status_idx" ON "VenueHomepageImageCandidate"("venueId", "status");
CREATE INDEX IF NOT EXISTS "VenueHomepageImageCandidate_runItemId_idx" ON "VenueHomepageImageCandidate"("runItemId");

DO $$
BEGIN
  ALTER TABLE "VenueGenerationRun"
    ADD CONSTRAINT "VenueGenerationRun_triggeredById_fkey"
    FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VenueGenerationRunItem"
    ADD CONSTRAINT "VenueGenerationRunItem_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "VenueGenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VenueGenerationRunItem"
    ADD CONSTRAINT "VenueGenerationRunItem_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VenueHomepageImageCandidate"
    ADD CONSTRAINT "VenueHomepageImageCandidate_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VenueHomepageImageCandidate"
    ADD CONSTRAINT "VenueHomepageImageCandidate_runItemId_fkey"
    FOREIGN KEY ("runItemId") REFERENCES "VenueGenerationRunItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VenueHomepageImageCandidate"
    ADD CONSTRAINT "VenueHomepageImageCandidate_selectedById_fkey"
    FOREIGN KEY ("selectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "VenueHomepageImageCandidate"
    ADD CONSTRAINT "VenueHomepageImageCandidate_venueImageId_fkey"
    FOREIGN KEY ("venueImageId") REFERENCES "VenueImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
