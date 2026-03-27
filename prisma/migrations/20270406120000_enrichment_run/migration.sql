DO $$ BEGIN
  CREATE TYPE "EnrichmentEntityType" AS ENUM ('ARTIST', 'ARTWORK', 'VENUE', 'EVENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EnrichmentGapFilter" AS ENUM ('ALL', 'MISSING_BIO', 'MISSING_DESCRIPTION', 'MISSING_IMAGE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EnrichmentStatusFilter" AS ENUM ('ALL', 'DRAFT', 'ONBOARDING', 'IN_REVIEW', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EnrichmentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EnrichmentRunItemStatus" AS ENUM ('PENDING', 'SKIPPED', 'SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "EnrichmentRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "templateKey" TEXT NOT NULL,
  "entityType" "EnrichmentEntityType" NOT NULL,
  "gapFilter" "EnrichmentGapFilter" NOT NULL DEFAULT 'ALL',
  "statusFilter" "EnrichmentStatusFilter" NOT NULL DEFAULT 'ALL',
  "searchEnabled" BOOLEAN NOT NULL DEFAULT true,
  "searchProvider" TEXT NOT NULL DEFAULT 'google_pse',
  "status" "EnrichmentRunStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" UUID NOT NULL,
  "startedAt" TIMESTAMPTZ,
  "finishedAt" TIMESTAMPTZ,
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "processedItems" INTEGER NOT NULL DEFAULT 0,
  "successItems" INTEGER NOT NULL DEFAULT 0,
  "skippedItems" INTEGER NOT NULL DEFAULT 0,
  "failedItems" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrichmentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnrichmentRunItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "runId" UUID NOT NULL,
  "entityType" "EnrichmentEntityType" NOT NULL,
  "artistId" UUID,
  "artworkId" UUID,
  "venueId" UUID,
  "eventId" UUID,
  "status" "EnrichmentRunItemStatus" NOT NULL DEFAULT 'PENDING',
  "fieldsChanged" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "fieldsBefore" JSONB,
  "fieldsAfter" JSONB,
  "confidenceBefore" INTEGER,
  "confidenceAfter" INTEGER,
  "searchUrl" TEXT,
  "reason" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrichmentRunItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "EnrichmentRun"
    ADD CONSTRAINT "EnrichmentRun_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EnrichmentRunItem"
    ADD CONSTRAINT "EnrichmentRunItem_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "EnrichmentRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EnrichmentRunItem"
    ADD CONSTRAINT "EnrichmentRunItem_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EnrichmentRunItem"
    ADD CONSTRAINT "EnrichmentRunItem_artworkId_fkey"
    FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EnrichmentRunItem"
    ADD CONSTRAINT "EnrichmentRunItem_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "Venue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EnrichmentRunItem"
    ADD CONSTRAINT "EnrichmentRunItem_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "EnrichmentRun_status_createdAt_idx"
  ON "EnrichmentRun"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EnrichmentRun_entityType_createdAt_idx"
  ON "EnrichmentRun"("entityType", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EnrichmentRun_requestedById_createdAt_idx"
  ON "EnrichmentRun"("requestedById", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "EnrichmentRunItem_runId_status_idx"
  ON "EnrichmentRunItem"("runId", "status");
CREATE INDEX IF NOT EXISTS "EnrichmentRunItem_entityType_status_idx"
  ON "EnrichmentRunItem"("entityType", "status");
CREATE INDEX IF NOT EXISTS "EnrichmentRunItem_artistId_idx"
  ON "EnrichmentRunItem"("artistId");
CREATE INDEX IF NOT EXISTS "EnrichmentRunItem_artworkId_idx"
  ON "EnrichmentRunItem"("artworkId");
CREATE INDEX IF NOT EXISTS "EnrichmentRunItem_venueId_idx"
  ON "EnrichmentRunItem"("venueId");
CREATE INDEX IF NOT EXISTS "EnrichmentRunItem_eventId_idx"
  ON "EnrichmentRunItem"("eventId");
