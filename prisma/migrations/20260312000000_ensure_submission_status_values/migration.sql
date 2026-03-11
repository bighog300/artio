-- Ensure all SubmissionStatus enum values exist (idempotent, safe to re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubmissionStatus') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'IN_REVIEW'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SubmissionStatus')
    ) THEN
      ALTER TYPE "SubmissionStatus" ADD VALUE 'IN_REVIEW';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'APPROVED'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SubmissionStatus')
    ) THEN
      ALTER TYPE "SubmissionStatus" ADD VALUE 'APPROVED';
    END IF;
  END IF;
END
$$;
