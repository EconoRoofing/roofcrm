-- =============================================================================
-- Migration 027: Float → Integer Cents (defensive variant)
-- =============================================================================
-- Convert every money column from `numeric`/`decimal` floats to `bigint` cents.
-- Eliminates float drift bugs.
--
-- DEFENSIVE: every cents column add and every backfill is guarded by an
-- information_schema check. If a parent table or source column doesn't exist
-- in this database (because an earlier migration was never applied), that
-- step is silently skipped instead of failing the whole migration.
--
-- This means the migration is SAFE TO RE-RUN. New columns are added with
-- IF NOT EXISTS; backfills only fire for columns that actually exist.
--
-- Wrapped in BEGIN/COMMIT — any unguarded failure rolls back everything.
-- =============================================================================

BEGIN;

-- ─── Helper: add a *_cents column to a table iff both the table and the
--             source column exist, then backfill from the source column.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  spec RECORD;
BEGIN
  -- Each row: (table, source dollar column, target cents column, NOT NULL?, default)
  FOR spec IN
    SELECT * FROM (VALUES
      -- jobs
      ('jobs',               'roof_amount',          'roof_amount_cents',          true,  '0'),
      ('jobs',               'gutters_amount',       'gutters_amount_cents',       true,  '0'),
      ('jobs',               'options_amount',       'options_amount_cents',       true,  '0'),
      ('jobs',               'total_amount',         'total_amount_cents',         true,  '0'),
      ('jobs',               'commission_amount',    'commission_amount_cents',    false, NULL),
      ('jobs',               'deductible',           'deductible_cents',           false, NULL),
      ('jobs',               'insurance_payout',     'insurance_payout_cents',     false, NULL),
      ('jobs',               'supplement_amount',    'supplement_amount_cents',    false, NULL),
      -- users
      ('users',              'hourly_rate',          'hourly_rate_cents',          true,  '0'),
      ('users',              'day_rate',             'day_rate_cents',             true,  '0'),
      -- time_entries
      ('time_entries',       'hourly_rate',          'hourly_rate_cents',          true,  '0'),
      ('time_entries',       'day_rate',             'day_rate_cents',             true,  '0'),
      ('time_entries',       'total_cost',           'total_cost_cents',           true,  '0'),
      -- material_lists
      ('material_lists',     'total_estimated_cost', 'total_estimated_cost_cents', true,  '0'),
      -- invoices
      ('invoices',           'amount',               'amount_cents',               true,  '0'),
      ('invoices',           'total_amount',         'total_amount_cents',         true,  '0'),
      ('invoices',           'paid_amount',          'paid_amount_cents',          true,  '0'),
      -- invoice_line_items
      ('invoice_line_items', 'unit_price',           'unit_price_cents',           true,  '0'),
      -- purchase_orders
      ('purchase_orders',    'total_estimated_cost', 'total_estimated_cost_cents', true,  '0'),
      -- supplement_rounds
      ('supplement_rounds',  'amount',               'amount_cents',               true,  '0'),
      -- job_subcontractors
      ('job_subcontractors', 'agreed_amount',        'agreed_amount_cents',        false, NULL),
      -- pricebook_items
      ('pricebook_items',    'base_price',           'base_price_cents',           true,  '0'),
      ('pricebook_items',    'cost',                 'cost_cents',                 false, NULL)
    ) AS t(tbl, src_col, dst_col, not_null, default_expr)
  LOOP
    -- Skip if the parent table doesn't exist in this DB
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = spec.tbl
    ) THEN
      RAISE NOTICE 'Skipping %.%: table does not exist', spec.tbl, spec.dst_col;
      CONTINUE;
    END IF;

    -- Skip if the source dollar column doesn't exist (legacy migration not applied)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.src_col
    ) THEN
      RAISE NOTICE 'Skipping %.%: source column %.% does not exist',
        spec.tbl, spec.dst_col, spec.tbl, spec.src_col;
      CONTINUE;
    END IF;

    -- Add the cents column if it isn't already there
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = spec.dst_col
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN %I BIGINT %s %s',
        spec.tbl,
        spec.dst_col,
        CASE WHEN spec.not_null THEN 'NOT NULL' ELSE '' END,
        CASE WHEN spec.default_expr IS NOT NULL THEN 'DEFAULT ' || spec.default_expr ELSE '' END
      );
      RAISE NOTICE 'Added %.% (BIGINT)', spec.tbl, spec.dst_col;
    END IF;

    -- Backfill from the source dollar column. NULL stays NULL for nullable
    -- targets; for NOT NULL targets we COALESCE the source to 0.
    IF spec.not_null THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = COALESCE(ROUND(%I * 100)::BIGINT, 0)',
        spec.tbl, spec.dst_col, spec.src_col
      );
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET %I = CASE WHEN %I IS NULL THEN NULL ELSE ROUND(%I * 100)::BIGINT END',
        spec.tbl, spec.dst_col, spec.src_col, spec.src_col
      );
    END IF;
    RAISE NOTICE 'Backfilled %.% from %.%', spec.tbl, spec.dst_col, spec.tbl, spec.src_col;
  END LOOP;
END $$;

-- ─── invoice_line_items.total_cents ──────────────────────────────────────────
-- Special case: depends on quantity * unit_price (the original column was a
-- GENERATED column). Add it only if both source columns exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoice_line_items'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_line_items' AND column_name = 'unit_price'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_line_items' AND column_name = 'quantity'
  ) THEN
    -- Add total_cents if not present
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invoice_line_items' AND column_name = 'total_cents'
    ) THEN
      ALTER TABLE public.invoice_line_items ADD COLUMN total_cents BIGINT NOT NULL DEFAULT 0;
      RAISE NOTICE 'Added invoice_line_items.total_cents';
    END IF;

    -- Backfill from quantity * unit_price (rounded to cents)
    UPDATE public.invoice_line_items
      SET total_cents = COALESCE(ROUND(quantity * unit_price * 100)::BIGINT, 0);
    RAISE NOTICE 'Backfilled invoice_line_items.total_cents';
  END IF;
END $$;

-- ─── time_entries unique partial index ───────────────────────────────────────
-- Audit finding #11: DB-level guard against double clock-in.
-- A user can have AT MOST ONE open time entry (clock_out IS NULL) at a time.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'time_entries'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_user
      ON public.time_entries (user_id)
      WHERE clock_out IS NULL;
    RAISE NOTICE 'Created unique partial index time_entries_one_open_per_user';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION (run after the migration — each row should be 0 drift)
-- =============================================================================
-- SELECT count(*) AS jobs_with_drift FROM jobs
--   WHERE ABS(total_amount_cents - ROUND(COALESCE(total_amount, 0) * 100)::BIGINT) > 0;
--
-- SELECT count(*) AS invoices_with_drift FROM invoices
--   WHERE ABS(total_amount_cents - ROUND(COALESCE(total_amount, 0) * 100)::BIGINT) > 0;
--
-- SELECT count(*) AS time_entries_with_drift FROM time_entries
--   WHERE ABS(total_cost_cents - ROUND(COALESCE(total_cost, 0) * 100)::BIGINT) > 0;
