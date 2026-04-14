-- =============================================================================
-- Migration 029: Payroll exclusion flag
-- =============================================================================
-- Audit finding #33. Previously, the `flagged` boolean on time_entries was
-- advisory only — flagged entries still counted toward payroll totals,
-- profitability rollups, and CSV exports.
--
-- `flagged` is auto-set for many legitimate reasons (shift > 12 hours, break
-- premium pay, forgotten clock-out auto-close) and shouldn't silently drop
-- the entry from payroll. But there was NO way for a manager to actually
-- exclude a fraudulent or duplicate entry without deleting the row.
--
-- New column: `excluded_from_payroll` BOOLEAN. Managers toggle it explicitly
-- via the new `excludeFromPayroll` server action. All payroll rollups filter
-- on this column.
--
-- Defensive: IF NOT EXISTS guard so this is safe to re-run.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'time_entries'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'time_entries'
        AND column_name = 'excluded_from_payroll'
    ) THEN
      ALTER TABLE public.time_entries
        ADD COLUMN excluded_from_payroll BOOLEAN NOT NULL DEFAULT false;
      RAISE NOTICE 'Added time_entries.excluded_from_payroll';
    END IF;
  END IF;
END $$;

COMMIT;
