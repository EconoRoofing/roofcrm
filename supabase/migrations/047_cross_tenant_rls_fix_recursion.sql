-- 047_cross_tenant_rls_fix_recursion.sql
--
-- Migration 046 caused infinite recursion in RLS policies. ROOT CAUSE:
--
--   - I added users.users_owner_scoped which queries companies
--     (subquery: SELECT id FROM companies WHERE owner_id = auth.uid()).
--   - companies has a PRE-EXISTING policy `companies_write` whose USING
--     clause is `EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
--     AND users.role = 'manager')` — it queries users.
--   - So: users' policy queries companies; companies' policy queries
--     users; loop. Postgres detects this and refuses with:
--
--       ERROR: 42P17 infinite recursion detected in policy for relation "users"
--
--   - The 4 other tables in 046 (invoices, invoice_line_items,
--     purchase_orders, supplier_contacts) ALSO recurse because they
--     all subquery `companies`, which then triggers its policies
--     including companies_write → users → cycle.
--
--   - Symptom in production: any SELECT on any of the 5 affected tables
--     errors out for any authenticated user. Service-role queries
--     (cron, auth callback) bypass RLS so they're unaffected — but the
--     app's normal request path is broken.
--
-- THE FIX: a SECURITY DEFINER helper function `owned_company_ids_for`
-- that returns the set of company IDs owned by a given user. SECURITY
-- DEFINER means the function body runs as the function owner (postgres)
-- and bypasses ALL RLS during its execution. The cycle breaks because
-- the policy expression no longer triggers companies' RLS at all — it
-- calls a function that internally bypasses RLS to read companies.
--
-- The function is restricted to `authenticated` only (revoke from
-- PUBLIC) so anon callers can't enumerate company memberships.
--
-- All 5 policies from 046 are dropped and recreated using the helper.

BEGIN;

-- ============================================================
-- 1. Drop the broken policies from migration 046
-- ============================================================
DROP POLICY IF EXISTS invoices_owner_scoped            ON public.invoices;
DROP POLICY IF EXISTS invoice_line_items_owner_scoped  ON public.invoice_line_items;
DROP POLICY IF EXISTS purchase_orders_owner_scoped     ON public.purchase_orders;
DROP POLICY IF EXISTS supplier_contacts_owner_scoped   ON public.supplier_contacts;
DROP POLICY IF EXISTS users_owner_scoped               ON public.users;

-- ============================================================
-- 2. SECURITY DEFINER helper that breaks the cycle
-- ============================================================
CREATE OR REPLACE FUNCTION public.owned_company_ids_for(p_user_id uuid)
  RETURNS SETOF uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.companies WHERE owner_id = p_user_id
$$;

REVOKE EXECUTE ON FUNCTION public.owned_company_ids_for(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.owned_company_ids_for(uuid) TO authenticated;

-- ============================================================
-- 3. Recreate the 5 policies using the helper instead of the
--    inline subquery on companies. The semantics are identical
--    (same set of owned company IDs); only the implementation
--    avoids RLS re-entry on companies.
-- ============================================================

CREATE POLICY invoices_owner_scoped ON public.invoices
  FOR ALL
  USING (company_id IN (SELECT owned_company_ids_for(auth.uid())))
  WITH CHECK (company_id IN (SELECT owned_company_ids_for(auth.uid())));

CREATE POLICY invoice_line_items_owner_scoped ON public.invoice_line_items
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (SELECT owned_company_ids_for(auth.uid()))
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (SELECT owned_company_ids_for(auth.uid()))
    )
  );

CREATE POLICY purchase_orders_owner_scoped ON public.purchase_orders
  FOR ALL
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE company_id IN (SELECT owned_company_ids_for(auth.uid()))
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE company_id IN (SELECT owned_company_ids_for(auth.uid()))
    )
  );

CREATE POLICY supplier_contacts_owner_scoped ON public.supplier_contacts
  FOR ALL
  USING (company_id IN (SELECT owned_company_ids_for(auth.uid())))
  WITH CHECK (company_id IN (SELECT owned_company_ids_for(auth.uid())));

CREATE POLICY users_owner_scoped ON public.users
  FOR ALL
  USING (
    id = auth.uid()
    OR primary_company_id IN (SELECT owned_company_ids_for(auth.uid()))
  )
  WITH CHECK (
    id = auth.uid()
    OR primary_company_id IN (SELECT owned_company_ids_for(auth.uid()))
  );

COMMIT;
