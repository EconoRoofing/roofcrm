-- 043_companies_owner_id.sql
--
-- Add the `owner_id` column to `companies` that the app code has been
-- assuming exists for weeks. lib/actions/profiles.ts::selectProfile and
-- lib/auth-helpers.ts both query `companies.owner_id` to gate cross-tenant
-- profile selection. No prior migration actually created the column, so
-- every selectProfile call silently returned zero rows via the Supabase
-- REST client (column-missing surfaces as "no match" rather than a loud
-- error on the `.eq()` path). The symptom: every PIN login threw
-- "No companies associated with this account" and bounced the user with
-- a generic 500.
--
-- Root cause: drift between code and schema. Whoever added the ownership
-- check wrote the app-side code but never shipped the matching migration.
--
-- Fix:
--   1. Add `owner_id uuid` referencing `auth.users(id)`, nullable for
--      backward compatibility with existing rows and inserts that don't
--      yet know who the owner is.
--   2. Index it — the selectProfile query filters on `owner_id` on every
--      login, and we'll do it again in any future "jobs for companies I
--      own" queries.
--   3. Deliberately NOT NOT-NULL — a NOT NULL constraint here would break
--      company creation flows that insert before establishing ownership.
--      Enforcement lives in the app code via `if (!ownedCompanies.length)
--      throw`, which is already in place.
--
-- Data backfill for Mario's three companies (Econo, DeHart, Nushake) is
-- intentionally NOT in this migration — it's a one-off owner assignment
-- that belongs in a separate data-fix SQL run against his Supabase
-- instance directly, not in a migration file that runs on every fresh
-- database.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_owner_id_idx ON companies(owner_id);
