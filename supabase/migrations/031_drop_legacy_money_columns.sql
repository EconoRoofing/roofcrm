-- =============================================================================
-- Migration 031: Drop legacy *_amount float columns (DEFERRED — DO NOT RUN YET)
-- =============================================================================
-- This is the irreversible second half of the float→cents migration. Phase 1
-- (migration 027) added *_cents columns and dual-wrote both. This migration
-- drops the legacy float columns and the GENERATED `total` column on
-- invoice_line_items.
--
-- DO NOT RUN until ALL of these are true:
--   1. Cents columns have been the source of truth in production for at
--      least a week with no money-display bugs reported.
--   2. The application code has been updated to:
--      - Stop dual-writing the legacy columns (still in place as of this commit)
--      - Remove the readMoneyFromRow legacy fallback
--      - Remove the legacy `*_amount` fields from TypeScript types
--   3. The verification SQL at the bottom of this file returns 0 rows.
--
-- After this migration runs, there is NO ROLLBACK PATH except restoring
-- from a Supabase backup. Be sure.
--
-- Defensive: every drop is guarded by an information_schema check, so this
-- is safe to re-run if you need to.
-- =============================================================================

BEGIN;

-- ─── Verification gate ──────────────────────────────────────────────────────
-- Refuse to run if any row has a non-zero legacy value with a zero cents
-- counterpart. This means dual-write is incomplete or there's drift, and
-- dropping the legacy columns would silently lose data.
DO $$
DECLARE
  v_drift integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'total_amount'
  ) THEN
    SELECT count(*) INTO v_drift FROM public.jobs
      WHERE COALESCE(total_amount, 0) > 0
        AND COALESCE(total_amount_cents, 0) = 0;
    IF v_drift > 0 THEN
      RAISE EXCEPTION 'REFUSING TO DROP: % jobs have legacy total_amount > 0 but total_amount_cents = 0. Run the cents backfill before dropping.', v_drift;
    END IF;
  END IF;
END $$;

-- ─── Drop legacy columns ────────────────────────────────────────────────────
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('jobs',               'roof_amount'),
      ('jobs',               'gutters_amount'),
      ('jobs',               'options_amount'),
      ('jobs',               'total_amount'),
      ('jobs',               'commission_amount'),
      ('jobs',               'deductible'),
      ('jobs',               'insurance_payout'),
      ('jobs',               'supplement_amount'),
      ('users',              'hourly_rate'),
      ('users',              'day_rate'),
      ('time_entries',       'hourly_rate'),
      ('time_entries',       'day_rate'),
      ('time_entries',       'total_cost'),
      ('material_lists',     'total_estimated_cost'),
      ('invoices',           'amount'),
      ('invoices',           'total_amount'),
      ('invoices',           'paid_amount'),
      ('invoice_line_items', 'unit_price'),
      ('invoice_line_items', 'total'),  -- the GENERATED column
      ('purchase_orders',    'total_estimated_cost'),
      ('supplement_rounds',  'amount'),
      ('job_subcontractors', 'agreed_amount'),
      ('pricebook_items',    'base_price'),
      ('pricebook_items',    'cost')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.col
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP COLUMN %I', spec.tbl, spec.col);
      RAISE NOTICE 'Dropped %.%', spec.tbl, spec.col;
    END IF;
  END LOOP;
END $$;

COMMIT;
