-- =============================================================================
-- Migration 033: Postgres-backed portal rate limits
-- =============================================================================
-- Audit R3-#10 + R3-#11. The previous in-memory rate limiter in
-- lib/actions/portal.ts kept a Map<token, timestamps[]> at module level.
-- Two problems:
--
-- 1. Vercel fans serverless invocations across N warm lambdas. Effective
--    cap was LIMIT × instance_count, so 5/minute became 5 × 20 = 100/minute
--    under bursty traffic.
-- 2. The bucket was keyed on the raw token BEFORE the token was validated
--    against the database, so an attacker could pump random tokens to
--    bloat the in-memory map and OOM the lambda.
--
-- This migration adds a server-side counter keyed on `job_id` (which only
-- exists after token validation) and an atomic UPSERT-based RPC that does
-- the check + increment in one round trip.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.portal_rate_limits (
  job_id              uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  count               integer NOT NULL DEFAULT 0,
  window_started_at   timestamptz NOT NULL DEFAULT now()
);

-- Lookup index for the periodic cleanup of expired windows.
CREATE INDEX IF NOT EXISTS portal_rate_limits_window_idx
  ON public.portal_rate_limits (window_started_at);

-- Atomic check-and-increment. Returns TRUE if the call is within the limit,
-- FALSE if the cap is hit. Uses a fixed-window-on-first-write strategy:
--   - First write to a job opens a new window
--   - Subsequent writes within `p_window_seconds` increment the count
--   - Once the window expires, the next write resets it
--
-- This is slightly more permissive than a sliding window (a determined
-- abuser could send LIMIT in the last second of one window and LIMIT in
-- the first second of the next), but it's vastly simpler and the absolute
-- cap is still ~2× LIMIT per (LIMIT × window) seconds, which is the right
-- ballpark for portal abuse defense.
--
-- SECURITY DEFINER so the server action can call it without granting raw
-- table privileges to the anon/authed roles.
CREATE OR REPLACE FUNCTION public.check_portal_rate_limit(
  p_job_id uuid,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.portal_rate_limits (job_id, count, window_started_at)
  VALUES (p_job_id, 1, NOW())
  ON CONFLICT (job_id) DO UPDATE
  SET
    count = CASE
      WHEN portal_rate_limits.window_started_at < NOW() - (p_window_seconds || ' seconds')::interval THEN 1
      ELSE portal_rate_limits.count + 1
    END,
    window_started_at = CASE
      WHEN portal_rate_limits.window_started_at < NOW() - (p_window_seconds || ' seconds')::interval THEN NOW()
      ELSE portal_rate_limits.window_started_at
    END
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

-- Periodic cleanup helper for the daily cron — drops rows whose window
-- has been closed for more than an hour. The RPC above also tolerates
-- stale rows (it resets them on next write), so this is purely cosmetic
-- table-size management.
CREATE OR REPLACE FUNCTION public.cleanup_portal_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.portal_rate_limits
  WHERE window_started_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMIT;
