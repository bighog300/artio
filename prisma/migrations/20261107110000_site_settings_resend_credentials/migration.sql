ALTER TABLE "SiteSettings"
  ADD COLUMN IF NOT EXISTS "resendApiKey" TEXT,
  ADD COLUMN IF NOT EXISTS "resendFromAddress" TEXT;
