CREATE TYPE "ArtworkOfferStatus" AS ENUM (
  'PENDING', 'ACCEPTED', 'COUNTERED', 'DECLINED', 'EXPIRED'
);

CREATE TABLE "ArtworkOffer" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "artworkId" UUID NOT NULL,
  "buyerName" TEXT NOT NULL,
  "buyerEmail" TEXT NOT NULL,
  "offerAmount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "message" TEXT,
  "status" "ArtworkOfferStatus" NOT NULL DEFAULT 'PENDING',
  "artistResponse" TEXT,
  "counterAmount" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArtworkOffer_artworkId_fkey"
    FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ArtworkOffer_artworkId_idx" ON "ArtworkOffer"("artworkId");
CREATE INDEX "ArtworkOffer_buyerEmail_idx" ON "ArtworkOffer"("buyerEmail");
CREATE INDEX "ArtworkOffer_status_idx" ON "ArtworkOffer"("status");
