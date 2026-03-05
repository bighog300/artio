-- No schema changes for status: VenueGenerationRunItem.status is already String.
-- New status values introduced: pending_processing, processing.

ALTER TABLE "VenueGenerationRunItem"
  ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "openingHours" TEXT,
  ADD COLUMN IF NOT EXISTS "contactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine1" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine2" TEXT,
  ADD COLUMN IF NOT EXISTS "region" TEXT;
