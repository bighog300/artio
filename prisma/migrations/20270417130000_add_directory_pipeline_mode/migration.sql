ALTER TABLE "DirectorySource"
  ADD COLUMN IF NOT EXISTS "pipelineMode" TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE "DirectorySource"
  ADD COLUMN IF NOT EXISTS "lastPipelineRunAt" TIMESTAMPTZ;

ALTER TABLE "DirectorySource"
  ADD COLUMN IF NOT EXISTS "lastPipelineError" TEXT;
