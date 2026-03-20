ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'ONBOARDING';

ALTER TABLE "VenueGenerationRunItem"
ADD COLUMN "eventsPageStatus" TEXT NOT NULL DEFAULT 'not_attempted';
