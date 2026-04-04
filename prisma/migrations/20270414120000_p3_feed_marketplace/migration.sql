-- P3: advanced feed, curator/follow systems, marketplace constraints
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isCurator" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "EventPromotion"
  ADD COLUMN IF NOT EXISTS "tier" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "maxDailySlots" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "slotsUsedToday" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "CollectionFollow" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "collectionId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionFollow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollectionFollow_userId_collectionId_key"
  ON "CollectionFollow"("userId", "collectionId");
CREATE INDEX IF NOT EXISTS "CollectionFollow_collectionId_createdAt_idx"
  ON "CollectionFollow"("collectionId", "createdAt");

ALTER TABLE "CollectionFollow"
  ADD CONSTRAINT "CollectionFollow_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionFollow"
  ADD CONSTRAINT "CollectionFollow_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "UserFeedCache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFeedCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserFeedCache_userId_eventId_key"
  ON "UserFeedCache"("userId", "eventId");
CREATE INDEX IF NOT EXISTS "UserFeedCache_userId_score_createdAt_idx"
  ON "UserFeedCache"("userId", "score", "createdAt");

ALTER TABLE "UserFeedCache"
  ADD CONSTRAINT "UserFeedCache_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFeedCache"
  ADD CONSTRAINT "UserFeedCache_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
