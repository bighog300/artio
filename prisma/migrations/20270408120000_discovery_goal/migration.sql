DO $$ BEGIN
  CREATE TYPE "DiscoveryGoalStatus"
    AS ENUM ('ACTIVE','PAUSED','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "DiscoveryGoal" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "entityType"  "DiscoveryEntityType" NOT NULL,
  "region"      TEXT        NOT NULL,
  "country"     TEXT        NOT NULL,
  "targetCount" INTEGER     NOT NULL,
  "status"      "DiscoveryGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes"       TEXT,
  "createdById" UUID        NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscoveryGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DiscoveryGoal_status_entityType_idx"
  ON "DiscoveryGoal"("status", "entityType");
CREATE INDEX IF NOT EXISTS "DiscoveryGoal_region_country_entityType_idx"
  ON "DiscoveryGoal"("region", "country", "entityType");
CREATE INDEX IF NOT EXISTS "DiscoveryGoal_createdAt_idx"
  ON "DiscoveryGoal"("createdAt" DESC);

ALTER TABLE "DiscoveryGoal"
  ADD CONSTRAINT "DiscoveryGoal_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IngestDiscoveryJob"
  ADD COLUMN IF NOT EXISTS "goalId" UUID,
  ADD COLUMN IF NOT EXISTS "queryYield" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "IngestDiscoveryJob_goalId_status_idx"
  ON "IngestDiscoveryJob"("goalId", "status");

DO $$ BEGIN
  ALTER TABLE "IngestDiscoveryJob"
    ADD CONSTRAINT "IngestDiscoveryJob_goalId_fkey"
    FOREIGN KEY ("goalId") REFERENCES "DiscoveryGoal"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "IngestDiscoveryCandidate"
  ADD COLUMN IF NOT EXISTS "seededVenueId" UUID;

DO $$ BEGIN
  ALTER TABLE "IngestDiscoveryCandidate"
    ADD CONSTRAINT "IngestDiscoveryCandidate_seededVenueId_fkey"
    FOREIGN KEY ("seededVenueId") REFERENCES "Venue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
