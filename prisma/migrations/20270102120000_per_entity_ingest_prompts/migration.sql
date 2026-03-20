ALTER TABLE "SiteSettings"
  ADD COLUMN IF NOT EXISTS "artworkExtractionSystemPrompt" TEXT,
  ADD COLUMN IF NOT EXISTS "artistBioSystemPrompt"         TEXT;
