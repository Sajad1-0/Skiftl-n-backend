-- Idempotent: supports DBs that still have the legacy "break-intervals" column
-- from an earlier draft of this migration, as well as fresh installs.
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
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shifts'
      AND column_name = 'break_intervals'
  ) THEN
    ALTER TABLE "shifts" ADD COLUMN "break_intervals" jsonb;
  END IF;

  -- If both exist (manual partial fix), drop the legacy hyphen name.
  IF EXISTS (
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
