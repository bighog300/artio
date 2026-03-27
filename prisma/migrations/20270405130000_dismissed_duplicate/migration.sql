CREATE TABLE IF NOT EXISTS "DismissedDuplicate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "artworkId1" UUID NOT NULL,
  "artworkId2" UUID NOT NULL,
  "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dismissedById" UUID,
  CONSTRAINT "DismissedDuplicate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DismissedDuplicate_artworkId1_artworkId2_key"
    UNIQUE ("artworkId1", "artworkId2")
);

CREATE INDEX IF NOT EXISTS "DismissedDuplicate_artworkId1_idx"
  ON "DismissedDuplicate"("artworkId1");
CREATE INDEX IF NOT EXISTS "DismissedDuplicate_artworkId2_idx"
  ON "DismissedDuplicate"("artworkId2");
