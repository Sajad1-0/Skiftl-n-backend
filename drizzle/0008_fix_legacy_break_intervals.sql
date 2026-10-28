-- Fix DBs that applied the earlier draft of 0007 which added "break-intervals"
-- (hyphen) instead of "break_intervals". No-op when already correct.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shifts'
      AND column_name = 'break-intervals'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shifts'
      AND column_name = 'break_intervals'
  ) THEN
    ALTER TABLE "shifts" RENAME COLUMN "break-intervals" TO "break_intervals";
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shifts'
      AND column_name = 'break-intervals'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shifts'
      AND column_name = 'break_intervals'
  ) THEN
    ALTER TABLE "shifts" DROP COLUMN "break-intervals";
  END IF;
END $$;
