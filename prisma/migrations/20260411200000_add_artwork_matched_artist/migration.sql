ALTER TABLE "IngestExtractedArtwork"
  ADD COLUMN IF NOT EXISTS "matchedArtistId" UUID;

DO $$ BEGIN
  ALTER TABLE "IngestExtractedArtwork"
    ADD CONSTRAINT "IngestExtractedArtwork_matchedArtistId_fkey"
    FOREIGN KEY ("matchedArtistId") REFERENCES "Artist"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "IngestExtractedArtwork_matchedArtistId_idx"
  ON "IngestExtractedArtwork"("matchedArtistId");
