-- Add readAt to ArtworkInquiry (idempotent)
ALTER TABLE "ArtworkInquiry"
  ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "ArtworkInquiry_readAt_idx"
  ON "ArtworkInquiry"("readAt");
