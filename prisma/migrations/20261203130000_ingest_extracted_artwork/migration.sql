CREATE TYPE "IngestArtworkStatus" AS ENUM ('PENDING','APPROVED','REJECTED','DUPLICATE');

CREATE TABLE "IngestExtractedArtwork" (
  "id"                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "title"               TEXT        NOT NULL,
  "medium"              TEXT,
  "year"                INTEGER,
  "dimensions"          TEXT,
  "description"         TEXT,
  "imageUrl"            TEXT,
  "artistName"          TEXT,
  "sourceEventId"       UUID        NOT NULL,
  "sourceUrl"           TEXT        NOT NULL,
  "status"              "IngestArtworkStatus" NOT NULL DEFAULT 'PENDING',
  "fingerprint"         TEXT        NOT NULL,
  "confidenceScore"     INTEGER     NOT NULL DEFAULT 0,
  "confidenceBand"      TEXT        NOT NULL DEFAULT 'LOW',
  "confidenceReasons"   JSONB,
  "createdArtworkId"    UUID,
  "extractionProvider"  TEXT        NOT NULL,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "IngestExtractedArtwork_fingerprint_key" UNIQUE ("fingerprint"),
  CONSTRAINT "IngestExtractedArtwork_createdArtworkId_key" UNIQUE ("createdArtworkId"),
  CONSTRAINT "IngestExtractedArtwork_sourceEventId_fkey"
    FOREIGN KEY ("sourceEventId") REFERENCES "Event"("id") ON DELETE CASCADE
);
CREATE INDEX "IngestExtractedArtwork_status_confidenceScore_idx"
  ON "IngestExtractedArtwork"("status", "confidenceScore" DESC);
CREATE INDEX "IngestExtractedArtwork_sourceEventId_idx"
  ON "IngestExtractedArtwork"("sourceEventId");
