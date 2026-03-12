-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "canonicalUrl" TEXT;

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "canonicalUrl" TEXT;

-- AlterTable
ALTER TABLE "IngestDiscoveryCandidate" ADD COLUMN "canonicalUrl" TEXT;

-- CreateIndex
CREATE INDEX "Venue_canonicalUrl_idx" ON "Venue"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Artist_canonicalUrl_idx" ON "Artist"("canonicalUrl");

-- CreateIndex
CREATE INDEX "IngestDiscoveryCandidate_jobId_canonicalUrl_idx" ON "IngestDiscoveryCandidate"("jobId", "canonicalUrl");

-- Backfill placeholder:
-- TODO: Backfill Venue/Artist canonicalUrl values using the TypeScript canonicalizeUrl logic
--       (normalize to https, lowercase hostname, strip www, trim tracking params, and remove trailing slash).
--       This should run as a one-off script to ensure consistency with application-level canonicalization.
