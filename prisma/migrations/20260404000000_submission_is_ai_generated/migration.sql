ALTER TABLE "Submission" ADD COLUMN "is_ai_generated" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Submission"
SET "is_ai_generated" = true
WHERE details IS NOT NULL
  AND details->>'source' LIKE '%ingest%';
