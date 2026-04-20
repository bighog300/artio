-- Sprint 3 creator platform: gallery publishing + scheduled publishing
CREATE TYPE "CollectionPublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "Event" ADD COLUMN "scheduledPublishAt" TIMESTAMP(3);

ALTER TABLE "Collection"
  ADD COLUMN "status" "CollectionPublishStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "coverAssetId" UUID,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "scheduledPublishAt" TIMESTAMP(3);

ALTER TABLE "Collection" ALTER COLUMN "isPublic" SET DEFAULT false;

ALTER TABLE "CollectionItem"
  ADD COLUMN "caption" TEXT,
  ADD COLUMN "commentary" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Collection_status_publishedAt_idx" ON "Collection"("status", "publishedAt");
CREATE INDEX "Collection_coverAssetId_idx" ON "Collection"("coverAssetId");
CREATE INDEX "CollectionItem_collectionId_sortOrder_idx" ON "CollectionItem"("collectionId", "sortOrder");

ALTER TABLE "Collection" ADD CONSTRAINT "Collection_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
