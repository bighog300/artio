ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "completenessScore"
    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "completenessFlags"
    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "completenessUpdatedAt"
    TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS
  "Venue_completenessScore_idx"
  ON "Venue"("completenessScore");

CREATE INDEX IF NOT EXISTS
  "Venue_completenessFlags_idx"
  ON "Venue"("completenessFlags");
