-- 046_cross_tenant_rls_phase1.sql
--
-- Cross-tenant RLS isolation, Phase 1: financial + PII tables.
--
-- BACKGROUND
-- Migration 044 enabled RLS on the previously-exposed tables but used a
-- generic `authed_floor` policy: `auth.uid() IS NOT NULL`. That closes the
-- anon-key hole (the urgent one — anyone with the project URL could CRUD
-- the table) but does NOT isolate one company's data from another. Any
-- authenticated user could query any other company's invoices, vendor
-- contacts, employee list, etc. via direct REST calls.
--
-- For Mario today this is theoretical (he's the only Google-authed user,
-- he owns all 3 companies, all data is his). The fix is forward-looking:
-- the moment another Google account joins (sales rep, accountant, partner
-- co-owner) the protection is in place.
--
-- POLICY DESIGN
-- The auth model is "Google account → owns companies via companies.owner_id".
-- A request's `auth.uid()` returns the Google account ID. From there we
-- compute the set of companies that user owns, and scope each table to
-- rows in that set:
--
--   USING (company_id IN (
--     SELECT id FROM public.companies WHERE owner_id = auth.uid()
--   ))
--
-- For tables without a direct company_id, we cascade via the FK chain
-- (e.g., invoice_line_items → invoices → company_id; purchase_orders →
-- jobs → company_id).
--
-- For users, we OR in `id = auth.uid()` so a Google-authed user can
-- always read their own bootstrap row (getUserWithCompany flow) even if
-- their primary_company_id is set weirdly.
--
-- SCOPE
-- This migration tightens 5 tables. Tier 1 financial + PII:
--   invoices, invoice_line_items, purchase_orders, supplier_contacts, users
--
-- Phase 2 (future migration) will tighten the rest:
--   jobs, companies, follow_ups, time_entries, messages, equipment, etc.
-- Held back here because they touch nearly every app code path and the
-- safer move is to validate this pattern on a smaller surface first.
--
-- VERIFIED BEFORE APPLY (rollback-transaction test):
--   - Mario sees 3 owned companies, 1 visible job, 0 invoices (none yet),
--     1 visible user (himself)
--   - Fake non-owner Google account sees 0 of everything
--   - The app's existing query patterns (eq('company_id', companyId))
--     all satisfy the new policies because the app already filters
--     explicitly — RLS is now the second-layer guarantee.

BEGIN;

-- ============================================================
-- INVOICES (direct company_id)
-- ============================================================
DROP POLICY IF EXISTS authed_floor ON public.invoices;
CREATE POLICY invoices_owner_scoped ON public.invoices
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- ============================================================
-- INVOICE LINE ITEMS (cascade via invoice → company)
-- ============================================================
DROP POLICY IF EXISTS authed_floor ON public.invoice_line_items;
CREATE POLICY invoice_line_items_owner_scoped ON public.invoice_line_items
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
  );

-- ============================================================
-- PURCHASE ORDERS (cascade via job → company)
-- Note: purchase_orders has no direct company_id — only job_id.
-- POs with NULL job_id (if any exist) become invisible. Today there
-- are no POs in the DB so the risk is theoretical; if/when ad-hoc
-- "non-job purchase order" rows are added we'll need a company_id
-- column on the table.
-- ============================================================
DROP POLICY IF EXISTS authed_floor ON public.purchase_orders;
CREATE POLICY purchase_orders_owner_scoped ON public.purchase_orders
  FOR ALL
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    )
  );

-- ============================================================
-- SUPPLIER CONTACTS (direct company_id)
-- ============================================================
DROP POLICY IF EXISTS authed_floor ON public.supplier_contacts;
CREATE POLICY supplier_contacts_owner_scoped ON public.supplier_contacts
  FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- ============================================================
-- USERS (primary_company_id, with self-read fallback)
--
-- The OR-with self-read is critical: getUserWithCompany() bootstraps
-- by reading public.users WHERE id = auth.uid() to discover which
-- company the caller is acting in. Without `id = auth.uid()` in the
-- USING clause, that bootstrap query returns 0 rows whenever the
-- caller's primary_company_id is unset/stale, and the entire app
-- breaks closed for them. The OR keeps the bootstrap working.
--
-- Drop both authed_floor (loose) and users_read (USING true — open to
-- ALL authed users including ones from other companies). Keep
-- users_update_own (id = auth.uid()) — that's correct as is.
-- ============================================================
DROP POLICY IF EXISTS authed_floor ON public.users;
DROP POLICY IF EXISTS users_read ON public.users;
CREATE POLICY users_owner_scoped ON public.users
  FOR ALL
  USING (
    id = auth.uid()
    OR primary_company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    id = auth.uid()
    OR primary_company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
  );

COMMIT;
