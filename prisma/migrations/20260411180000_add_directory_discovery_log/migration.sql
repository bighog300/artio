CREATE TABLE "DirectoryDiscoveryLog" (
  "id"                UUID        NOT NULL,
  "directorySourceId" UUID        NOT NULL,
  "entityId"          UUID        NOT NULL,
  "entityUrl"         TEXT        NOT NULL,
  "entityName"        TEXT,
  "status"            TEXT        NOT NULL,
  "candidateId"       UUID,
  "errorMessage"      TEXT,
  "model"             TEXT,
  "tokensUsed"        INTEGER,
  "confidenceScore"   INTEGER,
  "confidenceBand"    TEXT,
  "durationMs"        INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DirectoryDiscoveryLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DirectoryDiscoveryLog"
  ADD CONSTRAINT "DirectoryDiscoveryLog_directorySourceId_fkey"
  FOREIGN KEY ("directorySourceId") REFERENCES "DirectorySource"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectoryDiscoveryLog"
  ADD CONSTRAINT "DirectoryDiscoveryLog_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "DirectoryEntity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DirectoryDiscoveryLog_directorySourceId_createdAt_idx"
  ON "DirectoryDiscoveryLog"("directorySourceId", "createdAt" DESC);

CREATE INDEX "DirectoryDiscoveryLog_entityId_idx"
  ON "DirectoryDiscoveryLog"("entityId");

CREATE INDEX "DirectoryDiscoveryLog_candidateId_idx"
  ON "DirectoryDiscoveryLog"("candidateId");
