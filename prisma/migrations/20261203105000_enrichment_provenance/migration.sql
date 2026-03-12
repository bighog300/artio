-- AlterTable
ALTER TABLE "VenueEnrichmentLog"
ADD COLUMN IF NOT EXISTS "sourceDomain" TEXT,
ADD COLUMN IF NOT EXISTS "fieldConfidence" JSONB;
