-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "IngestExtractedEventStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Event"
ADD COLUMN "isAiExtracted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ingestSourceRunId" UUID;

-- CreateTable
CREATE TABLE "IngestRun" (
  "id" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "status" "IngestStatus" NOT NULL,
  "venueId" UUID NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "fetchFinalUrl" TEXT,
  "fetchStatus" INTEGER,
  "fetchContentType" TEXT,
  "fetchBytes" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),

  CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestExtractedEvent" (
  "id" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "runId" UUID NOT NULL,
  "venueId" UUID NOT NULL,
  "status" "IngestExtractedEventStatus" NOT NULL DEFAULT 'PENDING',
  "fingerprint" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "timezone" TEXT,
  "locationText" TEXT,
  "description" TEXT,
  "rawJson" JSONB NOT NULL,
  "model" TEXT,
  "rejectionReason" TEXT,

  CONSTRAINT "IngestExtractedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_ingestSourceRunId_idx" ON "Event"("ingestSourceRunId");

-- CreateIndex
CREATE INDEX "IngestRun_venueId_createdAt_idx" ON "IngestRun"("venueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestExtractedEvent_venueId_fingerprint_key" ON "IngestExtractedEvent"("venueId", "fingerprint");

-- CreateIndex
CREATE INDEX "IngestExtractedEvent_runId_idx" ON "IngestExtractedEvent"("runId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ingestSourceRunId_fkey" FOREIGN KEY ("ingestSourceRunId") REFERENCES "IngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestRun" ADD CONSTRAINT "IngestRun_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestExtractedEvent" ADD CONSTRAINT "IngestExtractedEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestExtractedEvent" ADD CONSTRAINT "IngestExtractedEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BackfillColumn: add lastIngestRunId to GallerySource now that IngestRun exists
ALTER TABLE "GallerySource" ADD COLUMN "lastIngestRunId" UUID;

-- AddForeignKey
ALTER TABLE "GallerySource" ADD CONSTRAINT "GallerySource_lastIngestRunId_fkey" FOREIGN KEY ("lastIngestRunId") REFERENCES "IngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
