DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VenueIngestFrequency') THEN
    CREATE TYPE "VenueIngestFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'MANUAL');
  END IF;
END $$;

ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "ingestFrequency" "VenueIngestFrequency" NOT NULL DEFAULT 'WEEKLY';
