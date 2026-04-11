ALTER TABLE "DirectorySource"
  ADD COLUMN "pipelineMode" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "lastPipelineRunAt" TIMESTAMPTZ,
  ADD COLUMN "lastPipelineError" TEXT;
