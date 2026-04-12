CREATE TABLE "SiteProfile" (
  "id"                   UUID        NOT NULL,
  "hostname"             TEXT        NOT NULL,
  "platform"             TEXT,
  "directoryUrl"         TEXT,
  "indexPattern"         TEXT,
  "linkPattern"          TEXT,
  "paginationType"       TEXT        NOT NULL DEFAULT 'letter',
  "exhibitionPattern"    TEXT,
  "sampleProfileUrls"    TEXT[]      NOT NULL DEFAULT '{}',
  "estimatedArtistCount" INTEGER,
  "confidence"           INTEGER     NOT NULL DEFAULT 0,
  "analysisError"        TEXT,
  "reasoning"            TEXT,
  "lastProfiledAt"       TIMESTAMPTZ,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteProfile_hostname_key" ON "SiteProfile"("hostname");
CREATE INDEX "SiteProfile_hostname_idx" ON "SiteProfile"("hostname");

ALTER TABLE "DirectorySource"
  ADD COLUMN IF NOT EXISTS "siteProfileId" UUID;

ALTER TABLE "DirectorySource"
  ADD CONSTRAINT "DirectorySource_siteProfileId_fkey"
  FOREIGN KEY ("siteProfileId") REFERENCES "SiteProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
