CREATE TABLE "ArtistStripeAccount" (
  "id"              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "artistId"        UUID        NOT NULL UNIQUE,
  "stripeAccountId" TEXT        NOT NULL UNIQUE,
  "status"          "StripeAccountStatus" NOT NULL DEFAULT 'PENDING',
  "chargesEnabled"  BOOLEAN     NOT NULL DEFAULT false,
  "payoutsEnabled"  BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ArtistStripeAccount_artistId_fkey"
    FOREIGN KEY ("artistId")
    REFERENCES "Artist"("id") ON DELETE CASCADE
);
CREATE INDEX "ArtistStripeAccount_stripeAccountId_idx"
  ON "ArtistStripeAccount"("stripeAccountId");
