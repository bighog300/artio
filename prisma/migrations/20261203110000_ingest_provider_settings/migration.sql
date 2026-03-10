ALTER TABLE "SiteSettings"
  ADD COLUMN "eventExtractionProvider"   TEXT,
  ADD COLUMN "venueEnrichmentProvider"   TEXT,
  ADD COLUMN "artistLookupProvider"      TEXT,
  ADD COLUMN "artistBioProvider"         TEXT,
  ADD COLUMN "artworkExtractionProvider" TEXT,
  ADD COLUMN "geminiApiKey"              TEXT,
  ADD COLUMN "anthropicApiKey"           TEXT;
