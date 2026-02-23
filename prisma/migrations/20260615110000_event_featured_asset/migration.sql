-- AlterTable
ALTER TABLE "Event"
ADD COLUMN "featuredAssetId" UUID;

-- CreateIndex
CREATE INDEX "Event_featuredAssetId_idx" ON "Event"("featuredAssetId");

-- AddForeignKey
ALTER TABLE "Event"
ADD CONSTRAINT "Event_featuredAssetId_fkey"
FOREIGN KEY ("featuredAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
