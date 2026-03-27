DO $$ BEGIN
  CREATE TYPE "DiscoveryTemplateSuggestionStatus"
    AS ENUM ('PENDING','APPROVED','DISMISSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS
  "DiscoveryTemplateSuggestion" (
  "id"          UUID NOT NULL
                DEFAULT gen_random_uuid(),
  "entityType"  "DiscoveryEntityType" NOT NULL,
  "region"      TEXT NOT NULL,
  "country"     TEXT NOT NULL,
  "template"    TEXT NOT NULL,
  "rationale"   TEXT NOT NULL,
  "status"      "DiscoveryTemplateSuggestionStatus"
                NOT NULL DEFAULT 'PENDING',
  "goalId"      UUID,
  "regionId"    UUID,
  "approvedAt"  TIMESTAMPTZ,
  "dismissedAt" TIMESTAMPTZ,
  "createdById" UUID NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscoveryTemplateSuggestion_pkey"
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS
  "DiscoveryTemplateSuggestion_status_entityType_idx"
  ON "DiscoveryTemplateSuggestion"("status","entityType");
CREATE INDEX IF NOT EXISTS
  "DiscoveryTemplateSuggestion_region_country_entityType_idx"
  ON "DiscoveryTemplateSuggestion"
    ("region","country","entityType");
CREATE INDEX IF NOT EXISTS
  "DiscoveryTemplateSuggestion_goalId_idx"
  ON "DiscoveryTemplateSuggestion"("goalId");
CREATE INDEX IF NOT EXISTS
  "DiscoveryTemplateSuggestion_regionId_idx"
  ON "DiscoveryTemplateSuggestion"("regionId");

ALTER TABLE "DiscoveryTemplateSuggestion"
  ADD CONSTRAINT IF NOT EXISTS
  "DiscoveryTemplateSuggestion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DiscoveryTemplateSuggestion"
  ADD CONSTRAINT IF NOT EXISTS
  "DiscoveryTemplateSuggestion_goalId_fkey"
  FOREIGN KEY ("goalId")
  REFERENCES "DiscoveryGoal"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscoveryTemplateSuggestion"
  ADD CONSTRAINT IF NOT EXISTS
  "DiscoveryTemplateSuggestion_regionId_fkey"
  FOREIGN KEY ("regionId")
  REFERENCES "IngestRegion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
