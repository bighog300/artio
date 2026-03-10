CREATE TYPE "IngestArtistStatus" AS ENUM ('PENDING','APPROVED','REJECTED','DUPLICATE');

CREATE TABLE "IngestExtractedArtist" (
  "id"                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"                TEXT        NOT NULL,
  "normalizedName"      TEXT        NOT NULL,
  "bio"                 TEXT,
  "mediums"             TEXT[]      NOT NULL DEFAULT '{}',
  "websiteUrl"          TEXT,
  "instagramUrl"        TEXT,
  "twitterUrl"          TEXT,
  "nationality"         TEXT,
  "birthYear"           INTEGER,
  "sourceUrl"           TEXT        NOT NULL,
  "searchQuery"         TEXT        NOT NULL,
  "status"              "IngestArtistStatus" NOT NULL DEFAULT 'PENDING',
  "fingerprint"         TEXT        NOT NULL,
  "confidenceScore"     INTEGER     NOT NULL DEFAULT 0,
  "confidenceBand"      TEXT        NOT NULL DEFAULT 'LOW',
  "confidenceReasons"   JSONB,
  "createdArtistId"     UUID,
  "extractionProvider"  TEXT        NOT NULL,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "IngestExtractedArtist_fingerprint_key" UNIQUE ("fingerprint")
);
CREATE INDEX "IngestExtractedArtist_status_confidenceScore_idx"
  ON "IngestExtractedArtist"("status", "confidenceScore" DESC);
CREATE INDEX "IngestExtractedArtist_normalizedName_idx"
  ON "IngestExtractedArtist"("normalizedName");

CREATE TABLE "IngestExtractedArtistEvent" (
  "id"                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "artistCandidateId" UUID        NOT NULL,
  "eventId"           UUID        NOT NULL,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "IngestExtractedArtistEvent_artistCandidateId_eventId_key"
    UNIQUE ("artistCandidateId", "eventId"),
  CONSTRAINT "IngestExtractedArtistEvent_artistCandidateId_fkey"
    FOREIGN KEY ("artistCandidateId")
    REFERENCES "IngestExtractedArtist"("id") ON DELETE CASCADE,
  CONSTRAINT "IngestExtractedArtistEvent_eventId_fkey"
    FOREIGN KEY ("eventId")
    REFERENCES "Event"("id") ON DELETE CASCADE
);
CREATE INDEX "IngestExtractedArtistEvent_artistCandidateId_idx"
  ON "IngestExtractedArtistEvent"("artistCandidateId");
CREATE INDEX "IngestExtractedArtistEvent_eventId_idx"
  ON "IngestExtractedArtistEvent"("eventId");

CREATE TABLE "IngestExtractedArtistRun" (
  "id"                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "artistCandidateId" UUID        NOT NULL,
  "searchResults"     JSONB       NOT NULL DEFAULT '{}',
  "model"             TEXT        NOT NULL,
  "usageTotalTokens"  INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "IngestExtractedArtistRun_artistCandidateId_fkey"
    FOREIGN KEY ("artistCandidateId")
    REFERENCES "IngestExtractedArtist"("id") ON DELETE CASCADE
);

ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "isAiDiscovered"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "extractionProvider" TEXT;

ALTER TABLE "SiteSettings"
  ADD COLUMN IF NOT EXISTS "googlePseApiKey" TEXT,
  ADD COLUMN IF NOT EXISTS "googlePseCx"     TEXT;
