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

---

## 7. Opaque UI errors amplify every backend bug (the April 2026 PIN saga)

**Symptom:** User reports "Something went wrong" or "It won't let me log in"
with no other detail. Hours spent chasing wrong hypotheses.

**Hits (all same root cause — opaque catch block):**
- "Hash mismatch" thought to be PIN typo → actually `PIN_HASH_SALT` rotation
- "Can't log in" thought to be verifyPin crash → actually `pin_failed_attempts = 5`
  lockout masked as generic error
- "Something went wrong" thought to be auth bug → actually
  `No companies associated with this account` from missing `owner_id` column
- "OAuth redirect loop" (2026-04-19) thought to be Next.js cookie issue →
  actually Mario mistyping his PIN — logs showed 3 POST `/select-profile`
  attempts per reload, identical visually to an OAuth loop

**Root cause:** `components/auth/pin-entry.tsx` catch block swallowed the
thrown error's `message` and replaced it with generic text. Every backend
failure looked identical to the user AND to me when debugging from their
description.

**Rule:**
- **Never swallow thrown error messages in user-facing catch blocks.** Pass
  `err.message` through to `setError`. If a throw site might leak internals,
  harden the message at the throw, not at the display. Context is richest
  at the throw.
- **When a user reports a generic "can't log in" error, FIRST pull logs
  via MCP** (Vercel runtime logs, Supabase auth logs, Postgres logs) before
  guessing. You have `mcp__a321ee8d-*__get_runtime_logs` and
  `mcp__1087ceb8-*__get_logs` — use them. In the April 2026 saga I spent
  40 minutes guessing before I pulled logs; once I did, diagnosis was 2 min.
- **When investigating a reported "loop," count the actual request events
  in logs.** An OAuth loop has repeated `/authorize` → `/callback` cycles.
  A user mistyping a PIN has a single `/auth/callback` + multiple
  `POST /select-profile` attempts. Different signature, different fix.

---

## 8. Zsh vs bash: `read -p` doesn't work in zsh

**Symptom:** Mario pastes a shell snippet I wrote, gets
`read: -p: no coprocess` errors, shell produces wrong output because
variables end up empty.

**Root cause:** I wrote `read -s -p "prompt" VAR` which is bash syntax.
macOS has defaulted to zsh since Catalina (2019). In zsh, `read -p` means
"coprocess pipe reference," not "prompt."

**Rule:**
- Default to **zsh-native syntax** for any macOS shell snippet:
  `read "VAR?prompt text"` (or `read -s "VAR?prompt text"` for hidden input).
- When mixing platforms, wrap in `bash -c '...'` explicitly.
- Test the snippet format in a throwaway Bash tool call if uncertain.

---

## 9. Hash-oracle bugs need production-runtime verification

**Symptom:** User computes a salted hash locally with what they believe is
the production salt; hash doesn't match; no way to debug without leaking
the salt or shipping code.

**Hit (2026-04-19):** Mario pulled `PIN_HASH_SALT` from Vercel env dashboard,
computed `sha256(pin + userId + salt)` locally via `shasum -a 256`. Hash
produced `39f6c83c...` but production's `verifyPin` computed `77f0d570...`
for the same inputs. Eventually traced to salt copy-paste producing a
different value than `process.env.PIN_HASH_SALT` at runtime — exact cause
(wrong env scope / whitespace / truncation) never confirmed but clearly
different values.

**Rule:**
- **For salted-hash reconciliation bugs, don't trust local computation
  against a copy-pasted secret.** Only production's runtime can authoritatively
  compute the hash.
- **Ship a minimal auth-gated admin endpoint** that accepts the inputs and
  returns the production hash + salt fingerprint (first4...last4 + length).
  The fingerprint reveals WHAT differs without leaking the salt itself.
- **The endpoint must include its own self-cleanup plan in the commit
  message** — "DELETE after X is restored." Delete immediately after use.
- **Verify the cryptographic primitives match.** I verified `shasum -a 256`
  on UTF-8 input produces byte-identical output to
  `TextEncoder().encode() → crypto.subtle.digest('SHA-256')` by running
  both on a test input. If the algorithms don't match, you're chasing the
  wrong bug.

---

## 10. Two parallel implementations of the same thing — grep for ALL before fixing

**Symptom:** Fix lands, user reports same bug with same error digest, I
assume my fix didn't deploy. Actually the fix was to the wrong function.

**Hit (2026-04-18):** Sign-out button threw "Not authenticated" (digest
`2082836210`). Patched `signOutAndClear()` in `lib/actions/profiles.ts`.
Same digest. Actually, Mario's manager-layout sign-out calls `signOut()`
in `lib/auth.ts` — a *different* function with the same purpose. Codebase
grew two parallel sign-out paths over time.

**Rule:**
- **Before fixing an auth/session bug, grep for ALL implementations of the
  operation** (not just the one you found first). Example: `grep -rn
  "signOut\|signOutAndClear\|logOut\|logout"`.
- **Check call sites:** `grep -rn "await signOut("` shows which layouts/pages
  actually use which implementation. Fix the one the user is hitting.
- **Consolidate duplicate implementations on the way out** — file a follow-up
  to merge them. Two functions doing the same thing is a recurring bug source.

---

## 11. Lockout counters during debugging — clear them between attempts

**Symptom:** I ship a fix, ask user to retry, their retry fails because
they've already burned their attempt budget from testing earlier. Rate
limits stack while debugging.

**Rule:** Before asking user to re-test a rate-limited flow (PIN, login,
password), **reset the counter via SQL/MCP first**. Two lines of prevention
beats 40 minutes of "it's still broken."
```sql
UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL
WHERE id = '…';
```

---

## 13. Calendar-write integrations need a dry-run env flag from day one

**Symptom:** Mario thought the calendar integration was broken because
"only days off show up" — actually it was correctly running for weeks
in `CALENDAR_DRY_RUN=true` mode that shipped during dev verification
and was never flipped off after launch. Synthetic `dry-run-<id>` event
IDs were being persisted to `jobs.calendar_event_id` so the rest of the
app behaved as if events existed; Google itself was never touched.

**Hits (2026-04-26):**
- ~30 minutes diagnosing "calendar broken" before noticing the synthetic
  ID prefix in `calendar_event_id`.
- A second 15 minutes after Mario "flipped" the env var but the empty
  redeploy commit fired BEFORE he actually changed the value — Vercel
  only re-reads env vars at build time, so we deployed with the OLD
  value and got fooled into thinking the flip didn't take.

**Rules:**
- **Every external-write integration ships with a `<INTEGRATION>_DRY_RUN`
  env flag from day 1**, with a clear log signature when it's on
  (`[CALENDAR_DRY_RUN] createGoogleEvent: ...`). Cheaper than building
  a fake Google for tests AND prevents accidental writes during early
  deploys.
- **Synthetic IDs from dry-run mode have a recognizable prefix**
  (`dry-run-<ts>-<rnd>`). Easy to grep production data for "are we
  still synthesizing instead of really syncing?"
- **Vercel env-var changes require a fresh build to take effect.**
  Sequence with humans in the loop: have user flip → user confirms
  flipped → THEN trigger redeploy → wait READY → user re-tests. Don't
  parallelize the env flip with the redeploy.

## 14. Server Components can't pass event handlers to Client Components

**Symptom:** A page with conditional or always-rendered inline event
handlers crashes with "Event handlers cannot be passed to Client
Component props" — Next.js error boundary fires (`app/error.tsx`),
user sees "We hit a snag" with a digest like `1407542458`.

**Hit (2026-04-26):** `components/job-detail.tsx` (a Server Component)
had `onMouseEnter`/`onMouseLeave` on a `<Link>` for hover styling, AND
an `onSaveAnnotations` callback passed to `<PhotoAnnotator>` (Client
Component) for placeholder console.log. Every job detail page crashed
on load. Mario only noticed when he opened his FIRST non-cancelled job
during calendar verification — bug had been latent for weeks.

**Rules:**
- **CSS `:hover` instead of inline JS hover handlers** in Server
  Components. No `'use client'` boundary needed.
- **If you genuinely need a handler, wrap in a small `'use client'`
  component.** The wrapper owns the handler; the parent passes only
  serializable data.
- **Make placeholder/optional handler props actually optional**
  (`onWhatever?: ...`) on the receiving Client Component, and just
  don't pass them from Server contexts. PhotoAnnotator's
  `onSaveAnnotations?` was already optional — we just had to remove
  the call site.
- **ESLint `eslint-plugin-react-server-components`** would catch this
  class of bug at lint time. Worth adding when convenient.

## 12a. Supabase RLS is TWO steps — policies without ENABLE are no-ops

**Symptom:** `supabase.from('X').select()` returns rows it shouldn't.
Supabase dashboard shows policies on table X. Advisor says
`policy_exists_rls_disabled`.

**Root cause:** Supabase RLS has two independent switches:
1. `CREATE POLICY` — defines the rule
2. `ALTER TABLE X ENABLE ROW LEVEL SECURITY` — activates RLS at the
   table level

**Without step 2, step 1 does nothing.** The policy sits dormant. The
table falls back to standard role grants (which default to permissive
for `anon`/`authenticated`/`service_role`). Result: anyone with the
public anon key can CRUD the table via the REST API.

**Hit (2026-04-19):** 6 tables (`invoices`, `invoice_line_items`,
`purchase_orders`, `supplier_contacts`, `automation_rules`,
`crew_unavailability`) had `authed_floor` policies but RLS disabled —
fully readable via the anon key. Migration 044 flipped the switch.

**Rule:**
- **Every new migration that adds a table MUST include `ALTER TABLE
  X ENABLE ROW LEVEL SECURITY;`** immediately after the `CREATE TABLE`,
  even before adding policies. Default to fail-closed.
- **Run Supabase security advisors after any schema migration** via
  `mcp__supabase__get_advisors({type: "security"})`. It catches this
  silent-failure in seconds.
- **Even tables that look "internal" need RLS on.** `job_number_sequence`
  is just a counter but was publicly exposed. Either enable RLS and
  access it via `SECURITY DEFINER` RPC, or block grants explicitly.

## 12b. Multiple PERMISSIVE RLS policies are OR'd — strictest doesn't win

**Symptom:** You add a restrictive policy alongside an existing
permissive one, expecting tightening. Nothing tightens.

**Root cause:** PostgreSQL RLS policies are evaluated as OR of all
matching PERMISSIVE policies. Adding `WITH CHECK (true)` alongside a
stricter policy makes the overall gate as loose as `true`, not as
strict as the strictest.

**Hit (2026-04-19):** `users` and `activity_log` both had `authed_floor`
(`auth.uid() IS NOT NULL`) for ALL commands, plus per-command policies
with `WITH CHECK (true)` for INSERT. The `true` defeated the floor.

**Rule:**
- **To tighten, RESTRICTIVE policies, not PERMISSIVE.** Use `CREATE
  POLICY ... AS RESTRICTIVE`. Multiple restrictive policies AND
  together.
- **Or**: drop the overlap. If you already have a `FOR ALL` floor, a
  redundant `FOR INSERT` PERMISSIVE policy can only loosen. Remove it.
- **Or**: combine into a single, fully-specified PERMISSIVE policy per
  command and drop the floor.

## 12. MCP logs > asking the user to paste logs

**Symptom:** I ask user to paste Vercel/Supabase logs. They paste partial
output, I ask for more, they get frustrated.

**Rule:** **Use MCP tools directly.** Both Vercel and Supabase have log
access MCPs available (`mcp__a321ee8d-*__get_runtime_logs` and
`mcp__1087ceb8-*__get_logs`). Pull logs myself:
- Full context in one shot
- No redaction errors
- No back-and-forth
- No chance Mario filters out the relevant line

The ONLY time to ask the user to paste is if the MCP doesn't cover the
log source (e.g. browser console logs, client-side network tab). Even then,
the `mcp__Claude_in_Chrome__read_console_messages` tool exists if the user
has the extension.
