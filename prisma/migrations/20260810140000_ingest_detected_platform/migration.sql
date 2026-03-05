ALTER TABLE "IngestRun"
  ADD COLUMN IF NOT EXISTS "detectedPlatform" TEXT;
