CREATE TABLE IF NOT EXISTS "UserNotificationPrefs" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "emailOnSubmissionResult" BOOLEAN NOT NULL DEFAULT true,
  "emailOnTeamInvite" BOOLEAN NOT NULL DEFAULT true,
  "weeklyDigest" BOOLEAN NOT NULL DEFAULT false,
  "eventRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  "followedCreatorUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "nearbyRecommendationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStartHour" INTEGER,
  "quietHoursEndHour" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserNotificationPrefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserNotificationPrefs_userId_key" ON "UserNotificationPrefs"("userId");

DO $$ BEGIN
  ALTER TABLE "UserNotificationPrefs" ADD CONSTRAINT "UserNotificationPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "UserNotificationPrefs"
  ADD COLUMN IF NOT EXISTS "eventRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "followedCreatorUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "nearbyRecommendationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quietHoursStartHour" INTEGER,
  ADD COLUMN IF NOT EXISTS "quietHoursEndHour" INTEGER;

CREATE TABLE IF NOT EXISTS "EventReminder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "preset" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EventReminder" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

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
