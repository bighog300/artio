ALTER TABLE "Artwork"
  ADD COLUMN IF NOT EXISTS "completenessScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "completenessFlags" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "completenessUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Artwork_completenessScore_idx"
  ON "Artwork"("completenessScore");

CREATE INDEX IF NOT EXISTS "Artwork_completenessFlags_idx"
  ON "Artwork" USING GIN("completenessFlags");
