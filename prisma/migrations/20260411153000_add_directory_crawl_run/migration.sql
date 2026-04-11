CREATE TABLE "DirectoryCrawlRun" (
  "id" UUID NOT NULL,
  "directorySourceId" UUID NOT NULL,
  "letter" TEXT NOT NULL,
  "page" INTEGER NOT NULL DEFAULT 1,
  "strategy" TEXT NOT NULL,
  "found" INTEGER NOT NULL DEFAULT 0,
  "newEntities" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "htmlPreview" TEXT,
  "durationMs" INTEGER,
  "crawledAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DirectoryCrawlRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DirectoryCrawlRun"
ADD CONSTRAINT "DirectoryCrawlRun_directorySourceId_fkey"
FOREIGN KEY ("directorySourceId") REFERENCES "DirectorySource"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DirectoryCrawlRun_directorySourceId_crawledAt_idx"
ON "DirectoryCrawlRun"("directorySourceId", "crawledAt" DESC);
