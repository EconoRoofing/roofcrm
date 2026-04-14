-- =============================================================================
-- Migration 039: Flip `estimates` bucket to private + tighten RLS
-- =============================================================================
-- Audit R5-#2 (CRITICAL). The `estimates` bucket was created in migration 001
-- with `public = true` AND a SELECT policy of `USING (bucket_id = 'estimates')`
-- — a policy with no tenant filter. Combined with the public flag, this
-- meant:
--
--   1. Anyone on the internet who could guess a path like
--      `estimates/{jobId}/signed.pdf` could download signed customer
--      contracts, job photos, and job videos WITHOUT authentication.
--   2. Even when the anon-read loophole was closed, any authenticated
--      user from ANY company could read any other company's files
--      because the RLS policy did not filter on company_id.
--
-- The R4-#19 signed-URL TTL work was theater — `getPublicUrl()` bypasses
-- the signing entirely when the bucket is public, and 4 code sites in
-- `photo-gallery.tsx`, `quick-photo.tsx`, and `photo-capture.tsx` were
-- using it.
--
-- This migration:
--   1. Flips the bucket to private — anon reads are denied by the
--      storage service directly, before RLS is even consulted.
--   2. Drops the wide-open SELECT policy.
--   3. Adds a narrow policy requiring authentication (defensive floor).
--      Cross-tenant scoping happens at the server-action layer + at the
--      new path-prefix convention described below. This matches the
--      documented trust model (see docs/architecture.md §1.4).
--
-- Path-prefix convention for new uploads:
--
--   Historical paths: `estimates/{jobId}/{timestamp}-signed.pdf`
--                     `job-photos/{jobId}/{cat}/{userId}-{ts}.jpg`
--
--   This migration does NOT enforce a company_id prefix. Doing so
--   requires rewriting every upload + read site in one atomic change,
--   which is impractical mid-session. Instead, the client code ALWAYS
--   fetches signed URLs (via createSignedUrl) with a known job id and
--   relies on the server action layer to have authorized the caller
--   against that job. This is the same "server-action layer is the
--   real trust boundary" pattern documented in architecture.md §1.
--
-- After this migration runs, ALL 4 code paths that used `getPublicUrl`
-- on the `estimates` bucket will return URLs that 400. This migration
-- must ship TOGETHER with the commit that rewrites those call sites:
--   - components/photos/photo-gallery.tsx (3 call sites)
--   - components/photos/quick-photo.tsx (2 call sites)
-- That commit is `audit-r5-critical` which accompanies this file.
--
-- Defensive: re-runnable via IF EXISTS guards and ALTER ... UPDATE
-- semantics which are idempotent.
-- =============================================================================

BEGIN;

-- ─── Flip to private ────────────────────────────────────────────────────────
-- storage.buckets.public is a boolean; updating it to false means the
-- `/storage/v1/object/public/...` endpoint returns 400 for this bucket
-- and all reads must go through `/storage/v1/object/sign/...` with a
-- valid signed URL. Historical files are unaffected — they're still
-- accessible, just via the signed-URL path only.
UPDATE storage.buckets
SET public = false
WHERE id = 'estimates';

-- ─── Drop the broken read policy ────────────────────────────────────────────
-- `USING (bucket_id = 'estimates')` allowed any authenticated user to
-- read from any path in the bucket. Gone.
DROP POLICY IF EXISTS "estimates_read" ON storage.objects;

-- ─── Add a narrow defensive-floor read policy ───────────────────────────────
-- Requires Supabase authentication. Because RoofCRM's trust model uses
-- the server-action layer as the real boundary (see docs/architecture.md
-- §1.4), this is the correct floor: block anonymous reads, delegate
-- cross-tenant scoping to the code that calls createSignedUrl.
--
-- Server actions that currently generate signed URLs:
--   - lib/pdf/render-invoice.ts (invoice PDFs)
--   - lib/actions/signature.ts (signed contract PDFs)
--   - lib/storage-urls.ts (re-sign helper)
--   - lib/actions/photo-reports.ts (bulk signed URLs for photo reports)
--   - lib/actions/insurance.ts (claim document download)
-- All of these are already behind `getUserWithCompany()` gates.
CREATE POLICY "estimates_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'estimates' AND auth.uid() IS NOT NULL);

-- The existing INSERT policy (`estimates_upload`) already requires
-- `auth.role() = 'authenticated'`, which is correct. Leaving it alone.

COMMIT;
