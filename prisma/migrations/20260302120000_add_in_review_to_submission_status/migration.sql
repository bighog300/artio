DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SubmissionStatus' AND e.enumlabel = 'SUBMITTED'
  ) THEN
    ALTER TYPE "SubmissionStatus" RENAME VALUE 'SUBMITTED' TO 'IN_REVIEW';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SubmissionStatus' AND e.enumlabel = 'IN_REVIEW'
  ) THEN
    ALTER TYPE "SubmissionStatus" ADD VALUE 'IN_REVIEW';
  END IF;
END
$$;
