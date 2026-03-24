-- Additive asset pipeline foundation.
ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "originalFilename" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "byteSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "originalUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "altText" TEXT,
  ADD COLUMN IF NOT EXISTS "focalPointX" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "focalPointY" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "cropJson" JSONB,
  ADD COLUMN IF NOT EXISTS "processingStatus" TEXT NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN IF NOT EXISTS "processingError" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "AssetVariant" (
  "id" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "variantName" TEXT NOT NULL,
  "mimeType" TEXT,
  "byteSize" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "storageKey" TEXT,
  "url" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssetVariant_assetId_idx" ON "AssetVariant"("assetId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssetVariant_assetId_variantName_key" ON "AssetVariant"("assetId", "variantName");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AssetVariant_assetId_fkey'
  ) THEN
    ALTER TABLE "AssetVariant"
      ADD CONSTRAINT "AssetVariant_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
