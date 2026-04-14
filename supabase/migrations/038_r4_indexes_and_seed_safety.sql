-- =============================================================================
-- Migration 038: R4 FK indexes + seed idempotency safety net
-- =============================================================================
-- Two fixes from the round-4 audit:
--
-- R4-#17 — Migration 001 seeds `companies` and `job_number_sequence` without
--          ON CONFLICT. Re-running 001 (e.g. `supabase db reset`) would
--          duplicate companies or error on the sequence PK. In practice
--          Supabase's migration runner tracks applied migrations so 001
--          never re-runs during normal `db push`, so this is a low-severity
--          "fresh reset protection" concern. Forward-only fix: defensively
--          upsert the job_number_sequence row so it exists on any
--          environment regardless of 001's state. Companies are left alone
--          (adding UNIQUE(name) now would fail if existing rows duplicate).
--
-- R4-#18 — Missing indexes on foreign-key columns. Postgres does NOT
--          auto-create indexes on FK columns; you have to declare them.
--          Every one of these columns is used in join or lookup paths;
--          without an index, delete-from-parent walks the entire child
--          table to enforce the cascade / set-null action. On a clean
--          system this is ~free; after a year of activity log growth
--          it turns a user deletion into a multi-second transaction.
--
--          All CREATE INDEX statements use IF NOT EXISTS so this migration
--          is safe to re-run and safe to apply over environments where
--          some indexes already exist.
-- =============================================================================

BEGIN;

-- ─── R4-#17: job_number_sequence safety net ──────────────────────────────────
-- If the row is missing (e.g. someone dropped it, or a fresh environment
-- ran migrations out of order), insert it. ON CONFLICT DO NOTHING means
-- the row gets inserted exactly once regardless of current state.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'job_number_sequence'
  ) THEN
    INSERT INTO public.job_number_sequence (year_prefix, last_number)
    VALUES ('26-', 0)
    ON CONFLICT (year_prefix) DO NOTHING;
  END IF;
END $$;

-- ─── R4-#18: foreign-key indexes ─────────────────────────────────────────────
-- Every one of these FK columns was missing an index. Ordered by table for
-- readability, with a brief note on the cost of omission.

-- Safety module tables (migration 010)
-- Without these, deleting a toolbox talk walks every session/signoff row.
CREATE INDEX IF NOT EXISTS idx_toolbox_talk_sessions_talk_id
  ON public.toolbox_talk_sessions (talk_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_talk_sessions_job_id
  ON public.toolbox_talk_sessions (job_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_talk_sessions_conducted_by
  ON public.toolbox_talk_sessions (conducted_by);

-- Safety inspections (migration 010)
CREATE INDEX IF NOT EXISTS idx_safety_inspections_job_id
  ON public.safety_inspections (job_id);
CREATE INDEX IF NOT EXISTS idx_safety_inspections_inspector_id
  ON public.safety_inspections (inspector_id);

-- Incidents (migration 010)
CREATE INDEX IF NOT EXISTS idx_incidents_job_id
  ON public.incidents (job_id);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by
  ON public.incidents (reported_by);

-- Certifications (migration 010 — user_id may or may not have idx already)
CREATE INDEX IF NOT EXISTS idx_certifications_user_id
  ON public.certifications (user_id);

-- Follow-ups (migration 015)
CREATE INDEX IF NOT EXISTS idx_follow_ups_job_id
  ON public.follow_ups (job_id);

-- Purchase orders + supplier contacts (migration 021)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_job_id
  ON public.purchase_orders (job_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_company_id
  ON public.supplier_contacts (company_id);

-- Job photos (migration 022) — user_id now correctly references public.users
-- after migration 037, so an index on it matters for delete-user cascades.
CREATE INDEX IF NOT EXISTS idx_job_photos_user_id
  ON public.job_photos (user_id);

-- Activity log (migration 001) — job_id is already indexed via the FK
-- lookups in most queries, but user_id is used for "what did this user do"
-- audit-trail reports and was missing.
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id
  ON public.activity_log (user_id);

COMMIT;
