-- User profile fields
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;

UPDATE "User"
SET "username" = LOWER(
  REGEXP_REPLACE(SPLIT_PART("email", '@', 1), '[^a-zA-Z0-9_]', '', 'g')
) || '_' || SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8)
WHERE "username" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- Follow target supports users
ALTER TYPE "FollowTargetType" ADD VALUE IF NOT EXISTS 'USER';

-- Collection models
CREATE TYPE "CollectionEntityType" AS ENUM ('EVENT', 'ARTIST', 'VENUE', 'ARTWORK');

CREATE TABLE "Collection" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionItem" (
  "id" UUID NOT NULL,
  "collectionId" UUID NOT NULL,
  "entityType" "CollectionEntityType" NOT NULL,
  "entityId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Collection_userId_createdAt_idx" ON "Collection"("userId", "createdAt");
CREATE UNIQUE INDEX "CollectionItem_collectionId_entityType_entityId_key" ON "CollectionItem"("collectionId", "entityType", "entityId");
CREATE INDEX "CollectionItem_entityType_entityId_idx" ON "CollectionItem"("entityType", "entityId");
CREATE INDEX "CollectionItem_collectionId_createdAt_idx" ON "CollectionItem"("collectionId", "createdAt");

ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
