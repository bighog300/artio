ALTER TABLE "IngestExtractedArtwork"
  ADD COLUMN "matchedArtistId" UUID;

ALTER TABLE "IngestExtractedArtwork"
  ADD CONSTRAINT "IngestExtractedArtwork_matchedArtistId_fkey"
  FOREIGN KEY ("matchedArtistId") REFERENCES "Artist"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "IngestExtractedArtwork_matchedArtistId_idx"
  ON "IngestExtractedArtwork"("matchedArtistId");
