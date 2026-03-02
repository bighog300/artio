-- Ensure APPROVED exists in ContentStatus for databases where older migrations were applied without it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ContentStatus'
      AND e.enumlabel = 'APPROVED'
  ) THEN
    ALTER TYPE "ContentStatus" ADD VALUE 'APPROVED';
  END IF;
END $$;
