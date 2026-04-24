-- 044_security_hardening.sql
--
-- Close real data-exposure and privilege-escalation holes flagged by
-- Supabase's security advisors (Apr 2026):
--
--   ERROR × 7  — RLS policies defined but RLS disabled on the table itself,
--                 OR RLS disabled on a public-schema table entirely.
--                 Affected tables: invoices, invoice_line_items,
--                 purchase_orders, supplier_contacts, automation_rules,
--                 crew_unavailability, job_number_sequence,
--                 portal_rate_limits.
--   WARN  × 2  — RLS policies with `WITH CHECK (true)` for INSERT, which
--                 bypass the sibling `authed_floor` ALL policies on those
--                 same tables. Affected: users.users_insert,
--                 activity_log.activity_insert.
--   WARN  × 4  — SECURITY DEFINER / trigger functions with mutable
--                 search_path (privilege-escalation vector via same-named
--                 function shadowing).
--
-- ROOT CAUSE of the RLS-disabled cluster: Supabase's two-step RLS model.
-- `CREATE POLICY` succeeds on a table without RLS enabled; the policy
-- lives dormant, visible in the dashboard, and does nothing until
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is run. Somebody wrote
-- policies for these tables but skipped step 2. Result: grants to the
-- `anon`, `authenticated`, and `service_role` roles — standard Supabase
-- defaults — become the ONLY gate, which is no gate. Anyone with the
-- public anon key (exposed in the client bundle by design) could
-- CRUD these tables via the REST API.
--
-- SCOPE: fix exactly what the advisor flagged. Cross-tenant isolation
-- (a user from company A reading company B's data) is a separate concern
-- tracked as a follow-up — requires per-table policies tied to the
-- company_id foreign key structure, and merits its own migration with
-- full test coverage per table.

BEGIN;

-- ============================================================
-- PART 1: ENABLE RLS on the 6 tables that already have the
-- `authed_floor` policy sitting dormant. Flipping this switch
-- activates the existing (auth.uid() IS NOT NULL) restriction,
-- closing anon-key access immediately.
-- ============================================================

ALTER TABLE public.invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_unavailability     ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PART 2: portal_rate_limits — service-role-only, no policy
--
-- The only caller is check_portal_rate_limit(), which IS
-- SECURITY DEFINER with search_path=public already set. That
-- function bypasses RLS regardless of the calling role, so
-- enabling RLS with NO policies on this table is the correct
-- "deny all direct REST access" state.
-- ============================================================

ALTER TABLE public.portal_rate_limits ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PART 3: job_number_sequence — only readable/writable via
-- the generate_job_number() RPC.
--
-- Problem: generate_job_number was NOT SECURITY DEFINER, so it
-- ran as the calling user's role. If we enabled RLS on
-- job_number_sequence without a policy, every `.rpc('generate_job_number')`
-- call would fail silently with a permission error, breaking
-- job creation across the app.
--
-- Fix: promote the function to SECURITY DEFINER so it runs as
-- the function owner (table owner) and can read/write the
-- sequence regardless of RLS. The function body is simple and
-- input-free (no SQL injection surface), so elevating it is safe.
-- Also pin search_path here since we're recreating anyway.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_job_number()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  prefix text;
  next_num integer;
BEGIN
  prefix := to_char(now(), 'YY') || '-';
  UPDATE public.job_number_sequence
    SET last_number = last_number + 1
    WHERE year_prefix = prefix
    RETURNING last_number INTO next_num;
  IF next_num IS NULL THEN
    INSERT INTO public.job_number_sequence (year_prefix, last_number) VALUES (prefix, 1);
    next_num := 1;
  END IF;
  RETURN prefix || lpad(next_num::text, 4, '0');
END;
$function$;

ALTER TABLE public.job_number_sequence ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PART 4: Drop the overly-permissive INSERT policies
--
-- Both `users.users_insert` and `activity_log.activity_insert`
-- use `WITH CHECK (true)`, i.e. unconditional accept for INSERT.
-- In Supabase's PERMISSIVE policy model, multiple permissive
-- policies are OR'd — so these `true` policies bypassed the
-- sibling `authed_floor` ALL policy that also requires
-- `auth.uid() IS NOT NULL`.
--
-- Dropping them lets `authed_floor` become the effective INSERT
-- gate. Actual call sites (lib/actions/profiles.ts createProfile,
-- lib/actions/activity.ts logActivity, etc.) all run from
-- server actions with an authenticated session, so auth.uid()
-- will be set and INSERT will still succeed.
-- ============================================================

DROP POLICY IF EXISTS users_insert    ON public.users;
DROP POLICY IF EXISTS activity_insert ON public.activity_log;


-- ============================================================
-- PART 5: Pin search_path on SECURITY DEFINER + trigger functions
--
-- Rationale: PostgreSQL functions resolve unqualified schema
-- references against `search_path`. If a function has a mutable
-- search_path and is SECURITY DEFINER (runs with privileges of
-- its owner, typically postgres), an attacker with CREATE
-- privilege on ANY earlier schema can shadow referenced names
-- and hijack the privileged call. Pinning search_path to
-- `public, pg_temp` forces deterministic resolution.
--
-- `generate_job_number`'s search_path was set in PART 3 via
-- CREATE OR REPLACE, so it's not listed here.
-- ============================================================

ALTER FUNCTION public.record_pin_failure(uuid, integer, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.reset_pin_attempts(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_updated_at()
  SET search_path = public, pg_temp;

COMMIT;
