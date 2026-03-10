CREATE TABLE "ArtworkInquiry" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "artworkId" UUID NOT NULL,
  "buyerName" TEXT NOT NULL,
  "buyerEmail" TEXT NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "ArtworkInquiry"
ADD CONSTRAINT "ArtworkInquiry_artworkId_fkey"
FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE CASCADE;

CREATE INDEX "ArtworkInquiry_artworkId_idx" ON "ArtworkInquiry"("artworkId");
CREATE INDEX "ArtworkInquiry_createdAt_idx" ON "ArtworkInquiry"("createdAt");

ALTER TYPE "NotificationType" ADD VALUE 'ARTWORK_INQUIRY_BUYER';
ALTER TYPE "NotificationType" ADD VALUE 'ARTWORK_INQUIRY_ARTIST';
