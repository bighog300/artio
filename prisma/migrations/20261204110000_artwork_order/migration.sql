CREATE TYPE "ArtworkOrderStatus" AS ENUM (
  'PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED'
);

CREATE TABLE "ArtworkOrder" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "artworkId" UUID NOT NULL,
  "buyerUserId" UUID,
  "buyerName" TEXT NOT NULL,
  "buyerEmail" TEXT NOT NULL,
  "amountPaid" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "platformFeeAmount" INTEGER NOT NULL,
  "stripePaymentIntentId" TEXT,
  "stripeSessionId" TEXT,
  "status" "ArtworkOrderStatus" NOT NULL DEFAULT 'PENDING',
  "confirmedAt" TIMESTAMPTZ,
  "cancelledAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ArtworkOrder_artworkId_fkey"
    FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE RESTRICT,
  CONSTRAINT "ArtworkOrder_buyerUserId_fkey"
    FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX "ArtworkOrder_artworkId_idx" ON "ArtworkOrder"("artworkId");
CREATE INDEX "ArtworkOrder_status_idx" ON "ArtworkOrder"("status");
CREATE INDEX "ArtworkOrder_buyerEmail_idx" ON "ArtworkOrder"("buyerEmail");

ALTER TABLE "Artwork"
  ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMPTZ;
