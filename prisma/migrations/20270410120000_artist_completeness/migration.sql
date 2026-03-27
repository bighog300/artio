ALTER TABLE "Artist"
  ADD COLUMN IF NOT EXISTS "completenessScore"
    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "completenessFlags"
    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "completenessUpdatedAt"
    TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS
  "Artist_completenessScore_idx"
  ON "Artist"("completenessScore");

CREATE INDEX IF NOT EXISTS
  "Artist_completenessFlags_idx"
  ON "Artist"("completenessFlags");
