ALTER TABLE "IngestDiscoveryJob"
  ADD COLUMN IF NOT EXISTS "regionId" UUID;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'IngestDiscoveryJob_regionId_fkey'
      AND conrelid = '"IngestDiscoveryJob"'::regclass
  ) THEN
    ALTER TABLE "IngestDiscoveryJob"
      ADD CONSTRAINT "IngestDiscoveryJob_regionId_fkey"
      FOREIGN KEY ("regionId") REFERENCES "IngestRegion"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IngestDiscoveryJob_regionId_idx" ON "IngestDiscoveryJob"("regionId");
