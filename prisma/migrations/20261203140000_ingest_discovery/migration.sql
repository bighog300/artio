CREATE TYPE "DiscoveryEntityType" AS ENUM ('VENUE','ARTIST','EVENT');
CREATE TYPE "DiscoveryJobStatus" AS ENUM ('PENDING','RUNNING','DONE','FAILED');
CREATE TYPE "DiscoveryCandidateStatus" AS ENUM ('PENDING','QUEUED','DONE','SKIPPED');

CREATE TABLE "IngestDiscoveryJob" (
  "id"              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityType"      "DiscoveryEntityType" NOT NULL,
  "queryTemplate"   TEXT        NOT NULL,
  "region"          TEXT        NOT NULL DEFAULT '',
  "searchProvider"  TEXT        NOT NULL DEFAULT 'google_pse',
  "maxResults"      INTEGER     NOT NULL DEFAULT 10,
  "status"          "DiscoveryJobStatus" NOT NULL DEFAULT 'PENDING',
  "resultsCount"    INTEGER,
  "errorMessage"    TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "IngestDiscoveryJob_status_createdAt_idx"
  ON "IngestDiscoveryJob"("status", "createdAt" DESC);

CREATE TABLE "IngestDiscoveryCandidate" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobId"       UUID        NOT NULL,
  "url"         TEXT        NOT NULL,
  "title"       TEXT,
  "snippet"     TEXT,
  "status"      "DiscoveryCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "skipReason"  TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "IngestDiscoveryCandidate_jobId_fkey"
    FOREIGN KEY ("jobId")
    REFERENCES "IngestDiscoveryJob"("id") ON DELETE CASCADE
);
CREATE INDEX "IngestDiscoveryCandidate_jobId_status_idx"
  ON "IngestDiscoveryCandidate"("jobId", "status");
CREATE INDEX "IngestDiscoveryCandidate_status_createdAt_idx"
  ON "IngestDiscoveryCandidate"("status", "createdAt");

ALTER TABLE "SiteSettings"
  ADD COLUMN IF NOT EXISTS "braveSearchApiKey" TEXT;
