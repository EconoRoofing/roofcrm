-- =============================================================================
-- Migration 032: Calendar watch catch-up columns
-- =============================================================================
-- The webhook at /api/calendar/webhook/route.ts references
-- `users.calendar_watch_channel_id` via `.eq(...)`, but that column was
-- never actually added in any migration. `lib/calendar-sync.ts` also
-- assumes an expiration column for the renewal cron.
--
-- This migration adds both columns defensively. Fully re-runnable via
-- information_schema guards.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RETURN;
  END IF;

  -- calendar_watch_channel_id: the Google channel id we passed when
  -- registering a watch. The webhook uses this to look up which user owns
  -- an incoming push (via X-Goog-Channel-ID → users row).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'calendar_watch_channel_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN calendar_watch_channel_id TEXT;
    RAISE NOTICE 'Added users.calendar_watch_channel_id';
  END IF;

  -- calendar_watch_expiration: when Google will stop sending pushes for
  -- this channel (~7 days after registration). The daily cron uses this
  -- to find watches that are about to expire and renew them.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'calendar_watch_expiration'
  ) THEN
    ALTER TABLE public.users ADD COLUMN calendar_watch_expiration TIMESTAMPTZ;
    RAISE NOTICE 'Added users.calendar_watch_expiration';
  END IF;

  -- Index for the daily cron's "find expiring watches" query
  CREATE INDEX IF NOT EXISTS idx_users_calendar_watch_expiration
    ON public.users (calendar_watch_expiration)
    WHERE calendar_watch_channel_id IS NOT NULL;
END $$;

COMMIT;
