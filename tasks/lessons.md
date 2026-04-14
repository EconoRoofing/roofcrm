# Lessons learned

Patterns I've gotten wrong in this codebase, with rules to prevent the same
mistake. Review at the start of every session.

---

## 1. Schema drift: codebase columns ≠ production DB columns

**Symptom:** Migration fails with `ERROR: 42703: column "X" does not exist`
even though `lib/actions/*.ts` references the column heavily and earlier
migration files appear to add it.

**Hits so far:**
- Migration 027 (cents): assumed `jobs.insurance_payout`, `deductible`, and
  `supplement_amount` existed. They were "added" in `017_missing_columns.sql`
  but that migration was never applied to Mario's production DB.
- Migration 030 (portal expiry): assumed `jobs.portal_token` existed. The
  portal feature has been written in code for a while but the DB column was
  never created. The portal route has been silently dead in prod.

**Root cause:** Mario's production Supabase DB has migration drift relative
to the `supabase/migrations/*.sql` files in the repo. Some early migrations
either didn't run, were reverted, or were applied to a different environment.
The codebase has columns the production DB doesn't.

**Rule (apply to EVERY future migration):**

1. **Default to defensive.** Wrap every `ALTER TABLE … ADD COLUMN` and every
   backfill `UPDATE` in `information_schema` existence checks. Use a `DO $$`
   block with `RAISE NOTICE` for skipped steps so the run output makes the
   skip visible.

2. **Catch-up missing columns when needed.** If a new migration depends on
   a column that the codebase assumes exists but the prod DB doesn't, ADD
   the missing column too — don't just guard around its absence. The portal
   feature can't function with a missing `portal_token` column; adding it
   defensively is better than leaving the feature dead.

3. **Idempotent + re-runnable.** Every `ADD COLUMN` uses `IF NOT EXISTS`.
   Every backfill is deterministic. Functions use `CREATE OR REPLACE` and
   `DROP FUNCTION IF EXISTS` first. The migration must be safe to run twice.

4. **Wrap the whole thing in `BEGIN; … COMMIT;`** so a failure in any step
   rolls back the rest. No partial state.

**Template for a defensive ADD COLUMN + BACKFILL:**
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'X' AND column_name = 'new_col'
  ) THEN
    ALTER TABLE public.X ADD COLUMN new_col TYPE;
    RAISE NOTICE 'Added X.new_col';
  END IF;

  -- Guard the backfill in case source_col was never applied
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'X' AND column_name = 'source_col'
  ) THEN
    UPDATE public.X SET new_col = derived_from(source_col) WHERE new_col IS NULL;
    RAISE NOTICE 'Backfilled X.new_col from source_col';
  ELSE
    RAISE NOTICE 'Skipped backfill: X.source_col does not exist';
  END IF;
END $$;
```

---

## 2. Plugin validator false positives are constant

**Symptom:** The Vercel/Next.js plugin keeps injecting "MANDATORY: read these
external docs" and "Use the Skill tool now" messages on tool calls that don't
relate to the matched library at all.

**Examples that have fired falsely so far:**
- `searchParams is async in Next.js 16` on `new URL(request.url).searchParams`
  in a Route Handler (the plugin can't distinguish the Web `URL` API from the
  Next.js page-props `searchParams`)
- `headers() is async in Next.js 16 — add await` on the `async headers()`
  config key in `next.config.ts` (the plugin can't distinguish the config
  function from the `next/headers` runtime function)
- `routing-middleware: rename middleware.ts to proxy.ts` on a file already
  named `proxy.ts`
- Lexical-recall keyword matches like "ai-elements" and "vercel-agent"
  triggering on prompts about a roofing CRM
- `react-best-practices` triggering on data-refactor edits
- `vercel-storage` triggering on Supabase SQL files

**Rule:**
- **Treat all plugin triggers as false positives by default.** Address them
  only when the matched library is actually relevant to what I'm doing.
- **For genuinely uncertain Next.js APIs, read `node_modules/next/dist/docs/`
  directly.** That's the version that's actually installed. AGENTS.md
  explicitly directs to that location.
- **Acknowledge the false positive in chat once and move on** — don't dwell
  on it, don't spawn a Skill tool, don't apologize.

---

## 3. Money: integer cents only, dollars only at boundaries

**Rule:**
- DB: `*_cents BIGINT`. Use the additive expand-and-contract pattern when
  introducing new cents columns.
- Application math: only `lib/money.ts` helpers (`dollarsToCents`,
  `centsToDollars`, `formatCents`, `applyPercentCents`, `multiplyCents`,
  `sumCents`, `splitCents`, `halfCents`, `readMoneyFromRow`).
- Boundaries:
  - User input → `dollarsToCents` immediately
  - Display → `formatCents` from cents
  - Third-party APIs that take dollars → `centsToDollars` at the boundary
- **Never** do `total / 2` on a dollar float. Use `halfCents(totalCents)`
  to get the exact deposit split.

---

## 4. Server actions and unmount safety

**Rule:** Server actions (`'use server'`) don't propagate AbortSignals from
the client. If a component awaits a server action and may unmount mid-flight,
guard every post-await `setState` with a `mountedRef.current` check inside a
`useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])`.
Don't try to AbortController your way out — server actions can't be
cancelled, only ignored.

---

## 5. Defensive null guards on `usePathname()`

**Rule:** `usePathname()` from `next/navigation` returns `string | null`.
The null window is brief (initial hydration) but the page WILL throw if
you call `.startsWith()` on it. Always guard:
```ts
const isActive = pathname != null && (pathname === href || pathname.startsWith(href + '/'))
```
Audit all nav components when you find one bug like this — the same pattern
gets copy-pasted.

---

## 6. Authoritative API docs live in `node_modules/next/dist/docs/`

Per `AGENTS.md`: this codebase is on Next.js 16 which has breaking API
changes from the version in my training data. When in doubt about ANY
Next.js API, check the local docs first:
```
node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/
node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
```
The plugin validator's "MANDATORY: read external docs" suggestions point to
WRONG external URLs as often as they're correct. The local docs are
authoritative for the version installed.
