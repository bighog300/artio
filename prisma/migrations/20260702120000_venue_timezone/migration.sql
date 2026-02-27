-- AlterTable
ALTER TABLE "Venue"
ADD COLUMN "timezone" TEXT;

-- CreateIndex
CREATE INDEX "Venue_timezone_idx" ON "Venue"("timezone");
