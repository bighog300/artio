-- CreateTable
CREATE TABLE "CronJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextFireAt" TIMESTAMP(3),
    "lastFiredAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CronJob_name_key" ON "CronJob"("name");

-- CreateIndex
CREATE INDEX "CronJob_nextFireAt_idx" ON "CronJob"("nextFireAt");

-- CreateIndex
CREATE INDEX "CronJob_enabled_nextFireAt_idx" ON "CronJob"("enabled", "nextFireAt");
