-- =============================================================================
-- Migration 034: Grant execute on portal rate-limit RPCs to anon + authenticated
-- =============================================================================
-- Audit R4-#4. Migration 033 created `check_portal_rate_limit` and
-- `cleanup_portal_rate_limits` as SECURITY DEFINER but forgot the explicit
-- GRANT EXECUTE clause. PostgreSQL's default is "no execute permission for
-- non-owner roles," so Supabase's `anon` role (which the portal uses — it's
-- an unauthenticated route) hits `permission denied for function
-- check_portal_rate_limit` on every call. This silently breaks the portal:
-- every `sendPortalMessage` and `requestBooking` call fails the rate-limit
-- check, returns false, and the server action bails before doing anything.
--
-- Forward-only fix: new migration adds the grants. 033 is left untouched
-- (never modify a migration that might be in any environment). GRANT EXECUTE
-- is idempotent, so this migration is safe to run multiple times and safe
-- to apply to any environment regardless of 033's status.
--
-- `authenticated` is included for defense in depth — the portal server
-- actions run as authenticated when Mario is browsing his own customer
-- portal for testing, and there's no reason to deny execute to that role.
-- =============================================================================

BEGIN;

GRANT EXECUTE ON FUNCTION public.check_portal_rate_limit(uuid, integer, integer)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_portal_rate_limits()
  TO anon, authenticated;

COMMIT;
