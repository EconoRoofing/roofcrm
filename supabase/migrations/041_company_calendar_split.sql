-- =============================================================================
-- Migration 041: Split company calendars into estimates / jobs routing
-- =============================================================================
-- Context — the current calendar write path in `lib/actions/jobs.ts` reads
-- `companies.calendar_id` (a single column, added in migration 017) and sends
-- ALL events for a given company to that one calendar. Mario's actual Google
-- Calendar setup has 5 company-scoped calendars with an asymmetric split:
--
--   Econo Roofing    → "Econo Roofing Estimates" + "Econo Roofing Jobs"
--   Nushake Roofing  → "Nushake Roofing Estimates" + "Nushake Roofing Jobs"
--   DeHart Roofing   → "DeHart Roofing" (single calendar, no split)
--
-- Adding two nullable columns lets Econo/Nushake specialize while DeHart
-- continues to use the existing `calendar_id` as its combined calendar:
--
--   estimates_calendar_id  → target for status = 'estimate_scheduled'
--   jobs_calendar_id       → target for 'sold'/'scheduled'/'completed'/
--                            'cancelled'
--   calendar_id (legacy)   → fallback when either split column is NULL
--
-- Fallback chain at resolve time (see pickCalendarId in lib/actions/jobs.ts):
--   estimates event → estimates_calendar_id ?? calendar_id ?? 'primary'
--   job event       → jobs_calendar_id ?? calendar_id ?? 'primary'
--
-- That's what lets DeHart keep its single calendar: its estimates_calendar_id
-- and jobs_calendar_id are both NULL, so both event types fall through to
-- `calendar_id` which we set to the DeHart Roofing calendar ID below.
--
-- Defensive: all ALTERs are IF NOT EXISTS; all UPDATEs use `IS DISTINCT FROM`
-- guards so re-running the migration is a no-op after the first apply.
-- =============================================================================

BEGIN;

-- ─── Schema ───────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS estimates_calendar_id text,
  ADD COLUMN IF NOT EXISTS jobs_calendar_id text;

COMMENT ON COLUMN public.companies.calendar_id IS
  'Combined calendar — used when estimates_calendar_id and jobs_calendar_id are both NULL (DeHart pattern).';
COMMENT ON COLUMN public.companies.estimates_calendar_id IS
  'Calendar for estimate_scheduled events. NULL falls back to calendar_id, then to primary.';
COMMENT ON COLUMN public.companies.jobs_calendar_id IS
  'Calendar for sold/scheduled/completed/cancelled events. NULL falls back to calendar_id, then to primary.';

-- ─── Backfill ─────────────────────────────────────────────────────────────
-- Seeded from the 5 company-scoped Google Calendar IDs Mario provided on
-- 2026-04-14. The "Econo Roofing estimates" calendar is the PRIMARY calendar
-- of the econoroofing209@gmail.com Google account (which is why its ID is an
-- email address and not a @group.calendar.google.com identifier). Storing it
-- literally rather than as the string 'primary' so it resolves to the same
-- physical calendar regardless of which user's access token is in play.

-- Econo Roofing: estimates → primary, jobs → secondary
UPDATE public.companies
SET estimates_calendar_id = 'econoroofing209@gmail.com',
    jobs_calendar_id      = '8n1kiibh81i0riqmhade74uggs@group.calendar.google.com'
WHERE name = 'Econo Roofing'
  AND (estimates_calendar_id IS DISTINCT FROM 'econoroofing209@gmail.com'
       OR jobs_calendar_id IS DISTINCT FROM '8n1kiibh81i0riqmhade74uggs@group.calendar.google.com');

-- Nushake Roofing: estimates + jobs on two secondaries
UPDATE public.companies
SET estimates_calendar_id = '62a7c5def9c9c91eba30bd79441428be49c56f5c79ba39be8c0a54b699d62b87@group.calendar.google.com',
    jobs_calendar_id      = '60b9a24f5d8c6a53a0b73384738c047a27120aa62bb5b66923c1f99d35eaac42@group.calendar.google.com'
WHERE name = 'Nushake Roofing'
  AND (estimates_calendar_id IS DISTINCT FROM '62a7c5def9c9c91eba30bd79441428be49c56f5c79ba39be8c0a54b699d62b87@group.calendar.google.com'
       OR jobs_calendar_id IS DISTINCT FROM '60b9a24f5d8c6a53a0b73384738c047a27120aa62bb5b66923c1f99d35eaac42@group.calendar.google.com');

-- DeHart Roofing: single combined calendar on the legacy column.
-- Leave estimates_calendar_id and jobs_calendar_id NULL so the fallback
-- chain routes both event types through calendar_id.
UPDATE public.companies
SET calendar_id = 'a6527d8c1dce25383ba7daf85368370a98cd7665e0d74969cc43ec7617f633fe@group.calendar.google.com'
WHERE name = 'DeHart Roofing'
  AND calendar_id IS DISTINCT FROM 'a6527d8c1dce25383ba7daf85368370a98cd7665e0d74969cc43ec7617f633fe@group.calendar.google.com';

COMMIT;
