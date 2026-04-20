ALTER TABLE "UserNotificationPrefs"
  ADD COLUMN IF NOT EXISTS "eventRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "followedCreatorUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "nearbyRecommendationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quietHoursStartHour" INTEGER,
  ADD COLUMN IF NOT EXISTS "quietHoursEndHour" INTEGER;

CREATE TABLE IF NOT EXISTS "EventReminder" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "preset" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventReminder_userId_eventId_key" ON "EventReminder"("userId", "eventId");
CREATE INDEX IF NOT EXISTS "EventReminder_remindAt_deliveredAt_idx" ON "EventReminder"("remindAt", "deliveredAt");
CREATE INDEX IF NOT EXISTS "EventReminder_userId_remindAt_idx" ON "EventReminder"("userId", "remindAt");

DO $$ BEGIN
  ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
