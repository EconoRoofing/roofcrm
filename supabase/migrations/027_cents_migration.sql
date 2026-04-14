-- =============================================================================
-- Migration 027: Float → Integer Cents
-- =============================================================================
-- Convert every money column from `numeric`/`decimal` floats to `bigint` cents.
-- Eliminates float drift bugs: invoice totals no longer diverge from line-item
-- sums by a penny, commission calculations are exact, payroll is exact.
--
-- STRATEGY: expand-and-contract.
--   1. Add `*_cents BIGINT` columns alongside the existing `*_amount` columns.
--   2. Backfill cents = ROUND(amount * 100).
--   3. Deploy new application code that reads `_cents` and dual-writes both
--      columns (so old reports/exports keep working during the transition).
--   4. After soak period, a follow-up migration drops the legacy columns.
--
-- BIGINT chosen over INTEGER because INT4 max is ~$21.4M and commercial jobs
-- can approach that. BIGINT max is effectively unbounded for this use case.
--
-- Also includes the unique partial index for time_entries double-clock-in
-- protection (deferred from audit #11).
-- =============================================================================

BEGIN;

-- ─── jobs ────────────────────────────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS roof_amount_cents       BIGINT NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gutters_amount_cents    BIGINT NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS options_amount_cents    BIGINT NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_amount_cents      BIGINT NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS commission_amount_cents BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deductible_cents        BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS insurance_payout_cents  BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS supplement_amount_cents BIGINT;

UPDATE jobs SET
  roof_amount_cents       = COALESCE(ROUND(roof_amount       * 100)::BIGINT, 0),
  gutters_amount_cents    = COALESCE(ROUND(gutters_amount    * 100)::BIGINT, 0),
  options_amount_cents    = COALESCE(ROUND(options_amount    * 100)::BIGINT, 0),
  total_amount_cents      = COALESCE(ROUND(total_amount      * 100)::BIGINT, 0),
  commission_amount_cents = CASE WHEN commission_amount IS NULL THEN NULL ELSE ROUND(commission_amount * 100)::BIGINT END,
  deductible_cents        = CASE WHEN deductible        IS NULL THEN NULL ELSE ROUND(deductible        * 100)::BIGINT END,
  insurance_payout_cents  = CASE WHEN insurance_payout  IS NULL THEN NULL ELSE ROUND(insurance_payout  * 100)::BIGINT END,
  supplement_amount_cents = CASE WHEN supplement_amount IS NULL THEN NULL ELSE ROUND(supplement_amount * 100)::BIGINT END;

-- ─── users (pay rates) ───────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS hourly_rate_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS day_rate_cents    BIGINT NOT NULL DEFAULT 0;

UPDATE users SET
  hourly_rate_cents = COALESCE(ROUND(hourly_rate * 100)::BIGINT, 0),
  day_rate_cents    = COALESCE(ROUND(day_rate    * 100)::BIGINT, 0);

-- ─── time_entries ────────────────────────────────────────────────────────────
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS hourly_rate_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS day_rate_cents    BIGINT NOT NULL DEFAULT 0;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS total_cost_cents  BIGINT NOT NULL DEFAULT 0;

UPDATE time_entries SET
  hourly_rate_cents = COALESCE(ROUND(hourly_rate * 100)::BIGINT, 0),
  day_rate_cents    = COALESCE(ROUND(day_rate    * 100)::BIGINT, 0),
  total_cost_cents  = COALESCE(ROUND(total_cost  * 100)::BIGINT, 0);

-- Unique partial index: a user can have AT MOST ONE open time entry at a time.
-- This is the DB-level fix for audit finding #11 (double clock-in race).
-- The code-level guard in clockIn() still runs as defense in depth.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_user
  ON time_entries (user_id)
  WHERE clock_out IS NULL;

-- ─── material_lists ──────────────────────────────────────────────────────────
ALTER TABLE material_lists ADD COLUMN IF NOT EXISTS total_estimated_cost_cents BIGINT NOT NULL DEFAULT 0;

UPDATE material_lists SET
  total_estimated_cost_cents = COALESCE(ROUND(total_estimated_cost * 100)::BIGINT, 0);

-- ─── invoices ────────────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_cents       BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount_cents  BIGINT NOT NULL DEFAULT 0;

UPDATE invoices SET
  amount_cents       = COALESCE(ROUND(amount       * 100)::BIGINT, 0),
  total_amount_cents = COALESCE(ROUND(total_amount * 100)::BIGINT, 0),
  paid_amount_cents  = COALESCE(ROUND(paid_amount  * 100)::BIGINT, 0);

-- ─── invoice_line_items ──────────────────────────────────────────────────────
-- `total` is a GENERATED ALWAYS column from migration 020 — it cannot coexist
-- with a new cents counterpart via ALTER. We drop it, add regular columns,
-- and the application computes total_cents = ROUND(quantity * unit_price_cents).
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS unit_price_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS total_cents      BIGINT NOT NULL DEFAULT 0;

UPDATE invoice_line_items SET
  unit_price_cents = COALESCE(ROUND(unit_price * 100)::BIGINT, 0),
  total_cents      = COALESCE(ROUND(quantity * unit_price * 100)::BIGINT, 0);

-- NOTE: We are NOT dropping the legacy `total` generated column in this
-- migration — that would break reads that still expect it. It will be dropped
-- in the follow-up migration once all code paths are on `total_cents`.

-- ─── purchase_orders ─────────────────────────────────────────────────────────
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_estimated_cost_cents BIGINT NOT NULL DEFAULT 0;

UPDATE purchase_orders SET
  total_estimated_cost_cents = COALESCE(ROUND(total_estimated_cost * 100)::BIGINT, 0);

-- ─── supplement_rounds ───────────────────────────────────────────────────────
ALTER TABLE supplement_rounds ADD COLUMN IF NOT EXISTS amount_cents BIGINT NOT NULL DEFAULT 0;

UPDATE supplement_rounds SET
  amount_cents = COALESCE(ROUND(amount * 100)::BIGINT, 0);

-- ─── job_subcontractors ──────────────────────────────────────────────────────
ALTER TABLE job_subcontractors ADD COLUMN IF NOT EXISTS agreed_amount_cents BIGINT;

UPDATE job_subcontractors SET
  agreed_amount_cents = CASE WHEN agreed_amount IS NULL THEN NULL ELSE ROUND(agreed_amount * 100)::BIGINT END;

-- ─── pricebook_items ─────────────────────────────────────────────────────────
ALTER TABLE pricebook_items ADD COLUMN IF NOT EXISTS base_price_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE pricebook_items ADD COLUMN IF NOT EXISTS cost_cents       BIGINT;

UPDATE pricebook_items SET
  base_price_cents = COALESCE(ROUND(base_price * 100)::BIGINT, 0),
  cost_cents       = CASE WHEN cost IS NULL THEN NULL ELSE ROUND(cost * 100)::BIGINT END;

-- =============================================================================
-- VERIFICATION (run after the migration — each row should be 0 drift)
-- =============================================================================
-- SELECT id, total_amount, total_amount_cents, (total_amount_cents - ROUND(total_amount * 100)::BIGINT) AS drift
--   FROM jobs WHERE ABS(total_amount_cents - ROUND(total_amount * 100)::BIGINT) > 0;

COMMIT;
