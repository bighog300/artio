-- CreateEnum
CREATE TYPE "GalleryCrawlStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "GalleryExtractionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "GallerySource" (
  "id" UUID NOT NULL,
  "venueId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "eventsPageUrl" TEXT,
  "platformType" TEXT,
  "strategyType" TEXT DEFAULT 'dom',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "crawlIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
  "lastCrawledAt" TIMESTAMPTZ,
  "nextCrawlAt" TIMESTAMPTZ,
  "lastCrawlStatus" "GalleryCrawlStatus" NOT NULL DEFAULT 'PENDING',
  "crawlFailureCount" INTEGER NOT NULL DEFAULT 0,
  "lastContentHash" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "GallerySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryPage" (
  "id" UUID NOT NULL,
  "gallerySourceId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "html" TEXT,
  "contentHash" TEXT,
  "crawlStatus" "GalleryCrawlStatus" NOT NULL DEFAULT 'PENDING',
  "extractionStatus" "GalleryExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "changed" BOOLEAN NOT NULL DEFAULT true,
  "lastCrawledAt" TIMESTAMPTZ,
  "extractedAt" TIMESTAMPTZ,
  "extractedEventsCount" INTEGER NOT NULL DEFAULT 0,
  "extractedArtistsCount" INTEGER NOT NULL DEFAULT 0,
  "extractedArtworksCount" INTEGER NOT NULL DEFAULT 0,
  "extractionHash" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "GalleryPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorySource" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "indexPattern" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "crawlIntervalMinutes" INTEGER NOT NULL DEFAULT 10080,
  "maxPagesPerLetter" INTEGER NOT NULL DEFAULT 5,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "DirectorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryCursor" (
  "id" UUID NOT NULL,
  "directorySourceId" UUID NOT NULL,
  "currentLetter" TEXT NOT NULL DEFAULT 'A',
  "currentPage" INTEGER NOT NULL DEFAULT 1,
  "queuedAt" TIMESTAMPTZ,
  "lastRunAt" TIMESTAMPTZ,
  "lastSuccessAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "DirectoryCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryEntity" (
  "id" UUID NOT NULL,
  "directorySourceId" UUID NOT NULL,
  "entityUrl" TEXT NOT NULL,
  "entityName" TEXT,
  "matchedArtistId" UUID,
  "lastSeenAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "DirectoryEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestMetrics" (
  "id" UUID NOT NULL,
  "bucketDate" DATE NOT NULL,
  "gallerySourceId" UUID,
  "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
  "pagesExtracted" INTEGER NOT NULL DEFAULT 0,
  "eventsExtracted" INTEGER NOT NULL DEFAULT 0,
  "artistsExtracted" INTEGER NOT NULL DEFAULT 0,
  "artworksExtracted" INTEGER NOT NULL DEFAULT 0,
  "succeededJobs" INTEGER NOT NULL DEFAULT 0,
  "failedJobs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "IngestMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GallerySource_venueId_baseUrl_key" ON "GallerySource"("venueId", "baseUrl");
CREATE INDEX "GallerySource_isActive_nextCrawlAt_idx" ON "GallerySource"("isActive", "nextCrawlAt");
CREATE INDEX "GallerySource_venueId_updatedAt_idx" ON "GallerySource"("venueId", "updatedAt" DESC);

CREATE UNIQUE INDEX "GalleryPage_gallerySourceId_url_key" ON "GalleryPage"("gallerySourceId", "url");
CREATE INDEX "GalleryPage_gallerySourceId_lastCrawledAt_idx" ON "GalleryPage"("gallerySourceId", "lastCrawledAt" DESC);
CREATE INDEX "GalleryPage_extractionStatus_updatedAt_idx" ON "GalleryPage"("extractionStatus", "updatedAt" DESC);

CREATE UNIQUE INDEX "DirectorySource_baseUrl_indexPattern_key" ON "DirectorySource"("baseUrl", "indexPattern");
CREATE INDEX "DirectorySource_isActive_updatedAt_idx" ON "DirectorySource"("isActive", "updatedAt" DESC);

CREATE UNIQUE INDEX "DirectoryCursor_directorySourceId_key" ON "DirectoryCursor"("directorySourceId");

CREATE UNIQUE INDEX "DirectoryEntity_directorySourceId_entityUrl_key" ON "DirectoryEntity"("directorySourceId", "entityUrl");
CREATE INDEX "DirectoryEntity_directorySourceId_lastSeenAt_idx" ON "DirectoryEntity"("directorySourceId", "lastSeenAt" DESC);

CREATE INDEX "IngestMetrics_bucketDate_gallerySourceId_idx" ON "IngestMetrics"("bucketDate", "gallerySourceId");
CREATE INDEX "IngestMetrics_bucketDate_idx" ON "IngestMetrics"("bucketDate");

-- AddForeignKey
ALTER TABLE "GallerySource" ADD CONSTRAINT "GallerySource_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GalleryPage" ADD CONSTRAINT "GalleryPage_gallerySourceId_fkey" FOREIGN KEY ("gallerySourceId") REFERENCES "GallerySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectoryCursor" ADD CONSTRAINT "DirectoryCursor_directorySourceId_fkey" FOREIGN KEY ("directorySourceId") REFERENCES "DirectorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectoryEntity" ADD CONSTRAINT "DirectoryEntity_directorySourceId_fkey" FOREIGN KEY ("directorySourceId") REFERENCES "DirectorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectoryEntity" ADD CONSTRAINT "DirectoryEntity_matchedArtistId_fkey" FOREIGN KEY ("matchedArtistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IngestMetrics" ADD CONSTRAINT "IngestMetrics_gallerySourceId_fkey" FOREIGN KEY ("gallerySourceId") REFERENCES "GallerySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
