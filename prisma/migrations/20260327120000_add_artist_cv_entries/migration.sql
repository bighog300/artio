DO $$ BEGIN
  CREATE TYPE "CvEntryType" AS ENUM (
    'EXHIBITION_SOLO',
    'EXHIBITION_GROUP',
    'RESIDENCY',
    'AWARD',
    'EDUCATION',
    'PUBLICATION',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ArtistCvEntry" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "artistId"     UUID NOT NULL,
  "entryType"    "CvEntryType" NOT NULL,
  "title"        TEXT NOT NULL,
  "organisation" TEXT,
  "location"     TEXT,
  "year"         INTEGER NOT NULL,
  "endYear"      INTEGER,
  "description"  TEXT,
  "url"          TEXT,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "ArtistCvEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ArtistCvEntry_artistId_year_idx"
  ON "ArtistCvEntry"("artistId", "year" DESC);

CREATE INDEX IF NOT EXISTS "ArtistCvEntry_artistId_entryType_idx"
  ON "ArtistCvEntry"("artistId", "entryType");

DO $$ BEGIN
  ALTER TABLE "ArtistCvEntry"
    ADD CONSTRAINT "ArtistCvEntry_artistId_fkey"
    FOREIGN KEY ("artistId")
    REFERENCES "Artist"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
