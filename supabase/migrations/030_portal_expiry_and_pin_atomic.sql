-- =============================================================================
-- Migration 030: Portal token expiry + atomic PIN lockout
-- =============================================================================
-- Two unrelated low-severity audit items, bundled because both need DB
-- changes. Defensive: every step is guarded so this is safe to re-run.
--
-- 1. PORTAL TOKEN EXPIRY (audit LOW)
--    Adds `jobs.portal_token_issued_at` so the application can age out
--    tokens after a configurable window (default 180 days). Without this,
--    a token issued years ago for a completed warranty job is still valid
--    and grants access to the portal forever.
--
-- 2. ATOMIC PIN LOCKOUT (audit LOW)
--    Replaces the read-then-update PIN-attempt logic in `verifyPin` with a
--    single Postgres function that atomically increments + checks the
--    threshold. Without this, two concurrent wrong PINs can both read
--    `attempts=4`, both increment to 5, and one of the failed attempts is
--    "lost" — the soft cap of 5 becomes ~10. Bounded but imperfect.
-- =============================================================================

BEGIN;

-- ─── 1. Portal token expiry ─────────────────────────────────────────────────
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
      ALTER TABLE public.jobs
        ADD COLUMN portal_token_issued_at TIMESTAMPTZ;
      RAISE NOTICE 'Added jobs.portal_token_issued_at';

      -- Backfill: assume any existing portal_token was issued at the job's
      -- updated_at. Not perfectly accurate, but close enough — gives every
      -- existing token a meaningful issuance date so the expiry check works
      -- immediately after the migration runs.
      UPDATE public.jobs
        SET portal_token_issued_at = updated_at
        WHERE portal_token IS NOT NULL
          AND portal_token_issued_at IS NULL;
      RAISE NOTICE 'Backfilled portal_token_issued_at from updated_at';
    END IF;
  END IF;
END $$;

-- ─── 2. Atomic PIN lockout function ─────────────────────────────────────────
-- Single-statement increment + lockout check. Returns the new attempt count
-- and whether the account is now locked (and until when).
--
-- Usage from the application:
--   SELECT * FROM record_pin_failure('<user-uuid>', 5, 15);
--
-- The function uses an UPDATE ... RETURNING which is atomic at the row level
-- — there is NO read-modify-write race. Postgres acquires a row lock on the
-- target user for the duration of the UPDATE.
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
AS $$
DECLARE
  v_attempts integer;
  v_lock_until timestamptz;
BEGIN
  -- Atomic increment + conditional lockout assignment.
  -- COALESCE handles the first-failure case where pin_failed_attempts is null.
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
$$;

-- Companion: reset attempts on successful login. Idempotent.
DROP FUNCTION IF EXISTS public.reset_pin_attempts(uuid);
CREATE OR REPLACE FUNCTION public.reset_pin_attempts(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.users
    SET pin_failed_attempts = 0,
        pin_locked_until    = NULL
    WHERE id = p_user_id;
$$;

-- Allow the anon + authenticated roles to call these (they're the only roles
-- the Supabase client uses). SECURITY DEFINER means the functions run as the
-- table owner regardless of caller, so RLS doesn't block the writes.
GRANT EXECUTE ON FUNCTION public.record_pin_failure(uuid, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_pin_attempts(uuid) TO anon, authenticated;

COMMIT;
