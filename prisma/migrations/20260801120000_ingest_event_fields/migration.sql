ALTER TABLE "Venue"
  ADD COLUMN "eventsPageUrl" TEXT;

ALTER TABLE "IngestExtractedEvent"
  ADD COLUMN "artistNames"  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN "imageUrl"     TEXT;
