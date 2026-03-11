ALTER TABLE "IngestDiscoveryJob"
  ADD COLUMN IF NOT EXISTS "regionId" UUID;

ALTER TABLE "IngestDiscoveryJob"
  ADD CONSTRAINT IF NOT EXISTS "IngestDiscoveryJob_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "IngestRegion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "IngestDiscoveryJob_regionId_idx" ON "IngestDiscoveryJob"("regionId");
