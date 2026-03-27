CREATE TABLE IF NOT EXISTS "ArtworkTag" (
  "artworkId" UUID NOT NULL,
  "tagId" UUID NOT NULL,
  CONSTRAINT "ArtworkTag_pkey" PRIMARY KEY ("artworkId", "tagId")
);

CREATE INDEX IF NOT EXISTS "ArtworkTag_tagId_idx"
  ON "ArtworkTag"("tagId");
CREATE INDEX IF NOT EXISTS "ArtworkTag_artworkId_idx"
  ON "ArtworkTag"("artworkId");
CREATE INDEX IF NOT EXISTS "ArtworkTag_tagId_artworkId_idx"
  ON "ArtworkTag"("tagId", "artworkId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ArtworkTag_artworkId_fkey'
  ) THEN
    ALTER TABLE "ArtworkTag"
      ADD CONSTRAINT "ArtworkTag_artworkId_fkey"
      FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ArtworkTag_tagId_fkey'
  ) THEN
    ALTER TABLE "ArtworkTag"
      ADD CONSTRAINT "ArtworkTag_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "Tag"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
