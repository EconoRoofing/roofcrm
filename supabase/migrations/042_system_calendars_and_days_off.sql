-- =============================================================================
-- Migration 042: system_calendars (utility overlays) + days_off (pulled cache)
-- =============================================================================
-- Context — Mario has 7 Google Calendars total:
--   5 company-scoped (estimates + jobs for Econo/Nushake, single for DeHart)
--     → handled by migration 041
--   2 cross-company utility calendars:
--     - "Admin/Payroll" → ops/payroll cycles, displayed in manager calendar
--     - "Days Off"      → crew-wide days off, displayed AND used as a
--                          scheduling guardrail (warn on job scheduling)
--
-- The two utility calendars don't belong on `companies` — they're cross-
-- company, not per-company. A tiny dedicated table keeps them discoverable
-- and extensible (future: per-user show/hide preferences, more overlays).
--
-- Days Off additionally needs a local-cache replica so the scheduling guard
-- can check availability without round-tripping Google on every job edit.
-- The nightly cron at /api/cron/daily pulls it (see migration 041's commit
-- and the cron route update in this patch set).
--
-- Defensive: every DDL uses IF NOT EXISTS / ON CONFLICT so re-running the
-- migration is a no-op after the first apply.
-- =============================================================================

BEGIN;

-- ─── system_calendars ─────────────────────────────────────────────────────
-- A tiny key-value registry for cross-company Google Calendars. The `key`
-- is a stable string identifier that server code uses to look up a specific
-- calendar by purpose rather than by display name (which Mario can change).
-- `label` and `color` drive the UI rendering in the manager calendar view.

CREATE TABLE IF NOT EXISTS public.system_calendars (
  key         text PRIMARY KEY,
  calendar_id text NOT NULL,
  label       text NOT NULL,
  color       text NOT NULL,  -- hex color for overlay chips
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_calendars IS
  'Cross-company Google Calendars (overlays in manager calendar view). Keyed by stable purpose string so display name is free to change.';

-- Backfill the two utility calendars Mario has configured. Colors match the
-- existing palette in components/manager/calendar-view.tsx — purple for
-- admin/payroll (informational), red for days off (blocking).
INSERT INTO public.system_calendars (key, calendar_id, label, color)
VALUES
  ('admin_payroll',
   'd2cfd469d001fec2bb8422d5db980b7ad637adada05c8bf2a12a35d93f97327f@group.calendar.google.com',
   'Admin/Payroll',
   '#a78bfa'),
  ('days_off',
   'daddebeb0e580e266a8b7195d18113100b1f5effdd686e9fbd1bcb9dd27af93c@group.calendar.google.com',
   'Days Off',
   '#f87171')
ON CONFLICT (key) DO UPDATE
  SET calendar_id = EXCLUDED.calendar_id,
      label       = EXCLUDED.label,
      color       = EXCLUDED.color,
      updated_at  = now();

-- Defensive floor: any authenticated user can read system_calendars (they
-- just hold Google Calendar IDs and display metadata, not PII). Writes are
-- restricted to service_role — Mario edits these via migration or Studio.
ALTER TABLE public.system_calendars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_calendars_read" ON public.system_calendars;
CREATE POLICY "system_calendars_read"
  ON public.system_calendars
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─── days_off ─────────────────────────────────────────────────────────────
-- A local mirror of the Days Off Google Calendar, refreshed nightly by the
-- /api/cron/daily sync step. Storing a flattened representation with
-- start_date/end_date as plain dates (not timestamptz) because Days Off are
-- all-day blocks — we don't care about hours or timezones.
--
-- The `google_event_id` is the source-of-truth identity from Google. The
-- sync step UPSERTs by this key and deletes rows whose ID no longer exists
-- upstream — so deleting a Days Off event in Google removes it from the
-- CRM's guardrail on the next cron run.

CREATE TABLE IF NOT EXISTS public.days_off (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id text UNIQUE NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  label           text,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.days_off IS
  'Local mirror of the Days Off Google Calendar, refreshed nightly by /api/cron/daily. Used by scheduling guards to warn on booking over blocked dates.';

-- Index for the scheduling guard's range overlap check:
--   WHERE start_date <= $target AND end_date >= $target
-- A composite btree (start_date, end_date) lets Postgres satisfy the first
-- half with an index range scan and the second with a filter, which is the
-- right shape for this table's usage pattern (~50-100 rows/year max).
CREATE INDEX IF NOT EXISTS days_off_date_range_idx
  ON public.days_off (start_date, end_date);

-- Defensive floor: any authenticated user can read days_off. Writes are
-- restricted to the cron route's service client (service_role bypasses RLS).
ALTER TABLE public.days_off ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "days_off_read" ON public.days_off;
CREATE POLICY "days_off_read"
  ON public.days_off
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

COMMIT;
