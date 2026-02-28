-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "isTrustedPublisher" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trustedPublisherSince" TIMESTAMP(3),
  ADD COLUMN "trustedPublisherById" UUID;

-- AddForeignKey
ALTER TABLE "User"
  ADD CONSTRAINT "User_trustedPublisherById_fkey"
  FOREIGN KEY ("trustedPublisherById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
