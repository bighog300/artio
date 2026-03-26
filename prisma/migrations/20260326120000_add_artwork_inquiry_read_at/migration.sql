-- AlterTable
ALTER TABLE "ArtworkInquiry"
ADD COLUMN "readAt" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "ArtworkInquiry_readAt_idx" ON "ArtworkInquiry"("readAt");
