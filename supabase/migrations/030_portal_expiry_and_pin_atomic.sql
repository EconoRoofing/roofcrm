-- =============================================================================
-- Migration 030: Portal token + expiry + atomic PIN lockout
-- =============================================================================
-- Three changes, all defensive against schema drift. Safe to re-run.
--
-- 1. PORTAL TOKEN COLUMN (catch-up — existed in code, not in this DB)
--    Adds `jobs.portal_token TEXT` if the column doesn't already exist.
--    The application code in `lib/actions/portal.ts` has been writing to
--    this column for a while, but the migration that created it was never
--    applied here. Without this, `generatePortalToken` and every other
--    portal action throws "column does not exist" at runtime.
--
-- 2. PORTAL TOKEN EXPIRY (audit LOW)
--    Adds `jobs.portal_token_issued_at TIMESTAMPTZ` so the application can
--    age out tokens after a configurable window (default 180 days). Without
--    this, a token issued years ago is still valid forever.
--
-- 3. ATOMIC PIN LOCKOUT (audit LOW)
--    Replaces the read-then-update PIN-attempt logic in `verifyPin` with a
--    single Postgres function that atomically increments + checks the
--    threshold. Without this, two concurrent wrong PINs can both read
--    `attempts=4`, both increment to 5, and one of the failed attempts is
--    "lost" — the soft cap of 5 becomes ~10. Bounded but imperfect.
-- =============================================================================

BEGIN;

-- ─── 1. portal_token column (catch-up) ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'jobs'
        AND column_name = 'portal_token'
    ) THEN
      ALTER TABLE public.jobs ADD COLUMN portal_token TEXT;
      RAISE NOTICE 'Added jobs.portal_token (catch-up — code referenced it but column did not exist)';

      -- Index for the lookup that every portal action does first
      CREATE INDEX IF NOT EXISTS idx_jobs_portal_token
        ON public.jobs (portal_token)
        WHERE portal_token IS NOT NULL;
      RAISE NOTICE 'Added partial index idx_jobs_portal_token';
    END IF;
  END IF;
END $$;

-- ─── 2. portal_token_issued_at column + backfill ───────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'jobs'
        AND column_name = 'portal_token_issued_at'
    ) THEN
      ALTER TABLE public.jobs ADD COLUMN portal_token_issued_at TIMESTAMPTZ;
      RAISE NOTICE 'Added jobs.portal_token_issued_at';
    END IF;

    -- Backfill ONLY if portal_token actually exists. After step 1 it always
    -- will, but we double-check for re-run safety in case someone ran this
    -- migration in pieces.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'jobs'
        AND column_name = 'portal_token'
    ) THEN
      UPDATE public.jobs
        SET portal_token_issued_at = updated_at
        WHERE portal_token IS NOT NULL
          AND portal_token_issued_at IS NULL;
      RAISE NOTICE 'Backfilled portal_token_issued_at from updated_at';
    ELSE
      RAISE NOTICE 'Skipped backfill: jobs.portal_token does not exist';
    END IF;
  END IF;
END $$;

-- ─── 3. Atomic PIN lockout function ─────────────────────────────────────────
-- Single-statement increment + lockout check. Returns the new attempt count
-- and whether the account is now locked (and until when).
--
-- Usage from the application:
--   SELECT * FROM record_pin_failure('<user-uuid>', 5, 15);
--
-- The function uses an UPDATE ... RETURNING which is atomic at the row level
-- — no read-modify-write race. Postgres acquires a row lock on the target
-- user for the duration of the UPDATE.
--
-- Defensive: only create if pin_failed_attempts column exists, in case the
-- 016_pin_rate_limit migration was never applied to this DB either.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'pin_failed_attempts'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'pin_locked_until'
  ) THEN
    DROP FUNCTION IF EXISTS public.record_pin_failure(uuid, integer, integer);
    CREATE OR REPLACE FUNCTION public.record_pin_failure(
      p_user_id uuid,
      p_threshold integer DEFAULT 5,
      p_lockout_minutes integer DEFAULT 15
    )
    RETURNS TABLE (
      new_attempts integer,
      locked_until timestamptz
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $func$
    DECLARE
      v_attempts integer;
      v_lock_until timestamptz;
    BEGIN
      UPDATE public.users
        SET pin_failed_attempts = COALESCE(pin_failed_attempts, 0) + 1,
            pin_locked_until    = CASE
              WHEN COALESCE(pin_failed_attempts, 0) + 1 >= p_threshold
                THEN now() + (p_lockout_minutes || ' minutes')::interval
              ELSE pin_locked_until
            END
        WHERE id = p_user_id
        RETURNING pin_failed_attempts, pin_locked_until
          INTO v_attempts, v_lock_until;

      RETURN QUERY SELECT v_attempts, v_lock_until;
    END;
    $func$;

    DROP FUNCTION IF EXISTS public.reset_pin_attempts(uuid);
    CREATE OR REPLACE FUNCTION public.reset_pin_attempts(p_user_id uuid)
    RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    AS $func$
      UPDATE public.users
        SET pin_failed_attempts = 0,
            pin_locked_until    = NULL
        WHERE id = p_user_id;
    $func$;

    GRANT EXECUTE ON FUNCTION public.record_pin_failure(uuid, integer, integer) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.reset_pin_attempts(uuid) TO anon, authenticated;

    RAISE NOTICE 'Created record_pin_failure + reset_pin_attempts functions';
  ELSE
    RAISE NOTICE 'Skipped PIN functions: users.pin_failed_attempts or pin_locked_until does not exist';
  END IF;
END $$;

COMMIT;
