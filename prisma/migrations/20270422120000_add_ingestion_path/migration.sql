ALTER TABLE "SiteProfile"
  ADD COLUMN IF NOT EXISTS "detectedSections" JSONB;

CREATE TABLE "IngestionPath" (
  "id"                   UUID        NOT NULL,
  "siteProfileId"        UUID        NOT NULL,
  "name"                 TEXT        NOT NULL,
  "baseUrl"              TEXT        NOT NULL,
  "contentType"          TEXT        NOT NULL,
  "indexPattern"         TEXT,
  "linkPattern"          TEXT,
  "paginationType"       TEXT        NOT NULL DEFAULT 'letter',
  "enabled"              BOOLEAN     NOT NULL DEFAULT true,
  "crawlDepth"           INTEGER     NOT NULL DEFAULT 1,
  "crawlIntervalMinutes" INTEGER     NOT NULL DEFAULT 10080,
  "lastRunAt"            TIMESTAMPTZ,
  "lastRunFound"         INTEGER,
  "lastRunError"         TEXT,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IngestionPath_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IngestionPath_siteProfileId_idx" ON "IngestionPath"("siteProfileId");
CREATE INDEX "IngestionPath_enabled_contentType_idx" ON "IngestionPath"("enabled", "contentType");
CREATE UNIQUE INDEX "IngestionPath_siteProfileId_baseUrl_key"
  ON "IngestionPath"("siteProfileId", "baseUrl");

ALTER TABLE "IngestionPath"
  ADD CONSTRAINT "IngestionPath_siteProfileId_fkey"
  FOREIGN KEY ("siteProfileId") REFERENCES "SiteProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
