ALTER TABLE "Submission" ADD COLUMN "isAiGenerated" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Submission"
SET "isAiGenerated" = true
WHERE details IS NOT NULL
  AND details->>'source' LIKE '%ingest%';
