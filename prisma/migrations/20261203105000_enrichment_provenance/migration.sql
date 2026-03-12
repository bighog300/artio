-- AlterTable
ALTER TABLE "VenueEnrichmentLog"
ADD COLUMN "sourceDomain" TEXT,
ADD COLUMN "fieldConfidence" JSONB;
