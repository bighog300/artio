ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VENUE_CLAIM_INVITE';

CREATE TYPE "CampaignType" AS ENUM ('BROADCAST', 'VENUE_CLAIM_INVITE');

ALTER TABLE "EmailCampaign"
  ADD COLUMN "campaignType" "CampaignType" NOT NULL DEFAULT 'BROADCAST';

CREATE TABLE "VenueClaimInvite" (
  "id" UUID NOT NULL,
  "venueId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "personalMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "claimId" UUID,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VenueClaimInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VenueClaimInvite_token_key" ON "VenueClaimInvite"("token");
CREATE UNIQUE INDEX "VenueClaimInvite_claimId_key" ON "VenueClaimInvite"("claimId");
CREATE INDEX "VenueClaimInvite_venueId_createdAt_idx" ON "VenueClaimInvite"("venueId", "createdAt");
CREATE INDEX "VenueClaimInvite_email_createdAt_idx" ON "VenueClaimInvite"("email", "createdAt");

ALTER TABLE "VenueClaimInvite" ADD CONSTRAINT "VenueClaimInvite_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VenueClaimInvite" ADD CONSTRAINT "VenueClaimInvite_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "VenueClaimRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VenueClaimInvite" ADD CONSTRAINT "VenueClaimInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
