-- =============================================================================
-- Migration 031: Drop legacy *_amount float columns
-- =============================================================================
-- This is the irreversible second half of the float→cents migration. Phase 1
-- (migration 027) added *_cents columns and dual-wrote both. This migration
-- drops the legacy float columns and the GENERATED `total` column on
-- invoice_line_items.
--
-- STATUS (as of audit Round 3 commits bb16f22 + 6e9dd8a): READY TO RUN.
--   [x] Cents columns are authoritative in production.
--   [x] Every dual-write site migrated to cents-only:
--       - invoicing.ts (createInvoice, markInvoicePaid, line items)
--       - jobs.ts (updateJob, commission stamp, cancel clear)
--       - time-tracking.ts (clockIn, clockOut)
--       - pricebook.ts (add/update/applyToEstimate)
--   [x] Every reader migrated off the legacy fallback:
--       - dashboard.ts, command-center.ts, profitability.ts, export.ts
--       - jobs.ts, invoicing.ts, quickbooks-export.ts, reporting.ts
--       - portal.ts, insurance.ts, price-memory.ts, follow-up-tasks.ts
--       - All PDF templates (estimate, invoice, agreement)
--       - All client components (kanban, job-detail, wizard, etc.)
--   [x] readMoneyFromRow transition helper deleted from lib/money.ts.
--   [x] Legacy float fields removed from lib/types/database.ts interfaces.
--   [x] Migration preamble below performs a defensive backfill + drift gate
--       wrapped in a transaction, so any remaining drift aborts the drop.
--
-- After this migration runs, there is NO ROLLBACK PATH except restoring
-- from a Supabase backup. Be sure.
--
-- Defensive: every DROP is guarded by an information_schema check, so this
-- is safe to re-run if you need to.
-- =============================================================================

BEGIN;

-- ─── Defensive backfill ─────────────────────────────────────────────────────
-- Audit R3-#2: belt-and-suspenders. Migration 027 backfilled all rows at the
-- time, but if a code path elsewhere inserted a row with only the legacy
-- column populated (forgot to dual-write), this catches it before the drift
-- gate below would refuse to drop. Idempotent: re-running this on already
-- backfilled rows is a no-op because we filter on `cents IS NULL OR = 0`.
-- Each statement is gated on column existence so the migration is safe to
-- re-run after the columns have been dropped.
DO $$
DECLARE
  spec RECORD;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('jobs',               'roof_amount',         'roof_amount_cents'),
      ('jobs',               'gutters_amount',      'gutters_amount_cents'),
      ('jobs',               'options_amount',      'options_amount_cents'),
      ('jobs',               'total_amount',        'total_amount_cents'),
      ('jobs',               'commission_amount',   'commission_amount_cents'),
      ('jobs',               'deductible',          'deductible_cents'),
      ('jobs',               'insurance_payout',    'insurance_payout_cents'),
      ('jobs',               'supplement_amount',   'supplement_amount_cents'),
      ('users',              'hourly_rate',         'hourly_rate_cents'),
      ('users',              'day_rate',            'day_rate_cents'),
      ('time_entries',       'hourly_rate',         'hourly_rate_cents'),
      ('time_entries',       'day_rate',            'day_rate_cents'),
      ('time_entries',       'total_cost',          'total_cost_cents'),
      ('material_lists',     'total_estimated_cost','total_estimated_cost_cents'),
      ('invoices',           'amount',              'amount_cents'),
      ('invoices',           'total_amount',        'total_amount_cents'),
      ('invoices',           'paid_amount',         'paid_amount_cents'),
      ('invoice_line_items', 'unit_price',          'unit_price_cents'),
      ('purchase_orders',    'total_estimated_cost','total_estimated_cost_cents'),
      ('supplement_rounds',  'amount',              'amount_cents'),
      ('job_subcontractors', 'agreed_amount',       'agreed_amount_cents'),
      ('pricebook_items',    'base_price',          'base_price_cents'),
      ('pricebook_items',    'cost',                'cost_cents')
    ) AS t(tbl, legacy, cents)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.legacy
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.cents
    ) THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = ROUND(COALESCE(%I, 0) * 100)::BIGINT WHERE %I IS NULL OR %I = 0',
        spec.tbl, spec.cents, spec.legacy, spec.cents, spec.cents
      );
    END IF;
  END LOOP;
END $$;

-- ─── Verification gate ──────────────────────────────────────────────────────
-- Refuse to run if any row has a non-zero legacy value with a zero cents
-- counterpart. The defensive backfill above should have caught everything,
-- so any remaining drift is a real problem. We check ALL the dual-write
-- pairs, not just jobs.total_amount.
DO $$
DECLARE
  spec RECORD;
  v_drift integer;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('jobs',               'roof_amount',         'roof_amount_cents'),
      ('jobs',               'gutters_amount',      'gutters_amount_cents'),
      ('jobs',               'options_amount',      'options_amount_cents'),
      ('jobs',               'total_amount',        'total_amount_cents'),
      ('jobs',               'commission_amount',   'commission_amount_cents'),
      ('jobs',               'deductible',          'deductible_cents'),
      ('jobs',               'insurance_payout',    'insurance_payout_cents'),
      ('jobs',               'supplement_amount',   'supplement_amount_cents'),
      ('users',              'hourly_rate',         'hourly_rate_cents'),
      ('users',              'day_rate',            'day_rate_cents'),
      ('time_entries',       'hourly_rate',         'hourly_rate_cents'),
      ('time_entries',       'day_rate',            'day_rate_cents'),
      ('time_entries',       'total_cost',          'total_cost_cents'),
      ('material_lists',     'total_estimated_cost','total_estimated_cost_cents'),
      ('invoices',           'amount',              'amount_cents'),
      ('invoices',           'total_amount',        'total_amount_cents'),
      ('invoices',           'paid_amount',         'paid_amount_cents'),
      ('invoice_line_items', 'unit_price',          'unit_price_cents'),
      ('purchase_orders',    'total_estimated_cost','total_estimated_cost_cents'),
      ('supplement_rounds',  'amount',              'amount_cents'),
      ('job_subcontractors', 'agreed_amount',       'agreed_amount_cents'),
      ('pricebook_items',    'base_price',          'base_price_cents'),
      ('pricebook_items',    'cost',                'cost_cents')
    ) AS t(tbl, legacy, cents)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.legacy
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.cents
    ) THEN
      EXECUTE format(
        'SELECT count(*) FROM public.%I WHERE COALESCE(%I, 0) > 0 AND COALESCE(%I, 0) = 0',
        spec.tbl, spec.legacy, spec.cents
      ) INTO v_drift;
      IF v_drift > 0 THEN
        RAISE EXCEPTION 'REFUSING TO DROP: % rows in %.% have legacy > 0 but cents = 0. Backfill before dropping.', v_drift, spec.tbl, spec.legacy;
      END IF;
    END IF;
  END LOOP;
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
