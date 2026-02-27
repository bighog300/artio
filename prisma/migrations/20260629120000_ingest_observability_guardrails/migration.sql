-- AlterTable
ALTER TABLE "IngestRun"
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "createdCandidates" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dedupedCandidates" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalCandidatesReturned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "model" TEXT,
ADD COLUMN "usagePromptTokens" INTEGER,
ADD COLUMN "usageCompletionTokens" INTEGER,
ADD COLUMN "usageTotalTokens" INTEGER,
ADD COLUMN "costUsdMicros" INTEGER,
ADD COLUMN "stopReason" TEXT,
ADD COLUMN "errorDetail" TEXT;

-- CreateIndex
CREATE INDEX "IngestRun_createdAt_idx" ON "IngestRun"("createdAt");

-- CreateIndex
CREATE INDEX "IngestRun_status_createdAt_idx" ON "IngestRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IngestRun_errorCode_createdAt_idx" ON "IngestRun"("errorCode", "createdAt");
