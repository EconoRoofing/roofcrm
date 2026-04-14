-- =============================================================================
-- Migration 028: Google Calendar webhook hardening
-- =============================================================================
-- Adds the columns needed to fix three bugs in the calendar webhook:
--   1. No syncToken → re-processes events on every notification (race + cost)
--   2. No channel-token verification → anyone can POST to the webhook
--   3. Always queries primary calendar → ignores per-company calendar IDs
--
-- Defensive: every column add is IF NOT EXISTS, safe to re-run.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN

    -- syncToken: opaque string returned by Google's events.list. Lets the
    -- webhook do an incremental sync instead of re-scanning a 1-hour window.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'calendar_sync_token'
    ) THEN
      ALTER TABLE public.users ADD COLUMN calendar_sync_token TEXT;
      RAISE NOTICE 'Added users.calendar_sync_token';
    END IF;

    -- watch_token: shared secret we provide to Google when we register a
    -- watch (the `token` param). Google echoes it back in every push as
    -- `X-Goog-Channel-Token`. We verify the header matches, which proves
    -- the request is actually from Google and not a forged POST.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'calendar_watch_token'
    ) THEN
      ALTER TABLE public.users ADD COLUMN calendar_watch_token TEXT;
      RAISE NOTICE 'Added users.calendar_watch_token';
    END IF;

    -- watch_calendar_id: which calendar this user's watch is registered for.
    -- The webhook needs to know which calendar to query when the push fires
    -- (without this it always queries 'primary' which is wrong for the per-
    -- company calendars under econoroofing209@gmail.com).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'calendar_watch_calendar_id'
    ) THEN
      ALTER TABLE public.users ADD COLUMN calendar_watch_calendar_id TEXT;
      RAISE NOTICE 'Added users.calendar_watch_calendar_id';
    END IF;

  END IF;
END $$;

COMMIT;
