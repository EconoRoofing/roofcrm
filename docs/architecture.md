# RoofCRM Architecture

This document is the single source of truth for the three core models
that underpin how RoofCRM works: **trust**, **money**, and **roles**.
It exists because each of these decisions is non-obvious from reading
the code alone, and getting them wrong causes the specific classes of
bugs that audit rounds 1–4 found 85+ of. If you're about to touch auth,
money handling, or role gates, read the relevant section first.

---

## 1. Trust Model — "Shared-Device Multi-Profile"

RoofCRM uses a **Netflix-style shared-device model**: one Supabase auth
identity (`econoroofing209@gmail.com`, the shared Google account)
maps to **N profiles** in `public.users`, one per person who works
across the three roofing companies (Econo, DeHart, Nushake).

### How identity actually resolves at runtime

```
HTTP request
    ↓
proxy.ts (Next.js middleware)
    ↓ reads `active_profile_id` cookie
    ↓ reads Supabase session cookies
    ↓
Route handler / Server Action / Server Component
    ↓
lib/auth-helpers.ts:getUserWithCompany()
    ↓
  { userId, companyId, role }
    ↓
downstream .eq('company_id', companyId) filters
```

**The trust boundary is the server-action layer, not RLS.** Every
read and write goes through a `'use server'` function that calls
`getUserWithCompany()` and scopes its queries by `companyId` and/or
`userId`. RLS policies are a defensive floor that denies access to
unauthenticated clients — they do NOT enforce the per-profile boundary.
See §1.4 below.

### 1.1. The key data flow

| Layer | What it knows | What it enforces |
|---|---|---|
| `auth.users` (Supabase) | The shared Google identity | Session validity only |
| `active_profile_id` cookie | Which profile is currently "in use" | Nothing — just a pointer |
| `public.users` | The profiles under the identity | Role, primary_company_id, PIN hash |
| `getUserWithCompany()` | Caller's resolved profile | Throws if no profile |
| Server actions | Business logic | **Company scope via `.eq('company_id', companyId)`** |
| RLS policies | Supabase auth layer | Defensive floor only |

### 1.2. Profile selection flow

1. User lands on `/` and proxy.ts redirects based on the `active_profile_id`
   cookie:
   - No cookie → `/select-profile`
   - Cookie set → role-based home (`/home` for owner/office_manager,
     `/today` for sales, `/route` for crew)
2. `/select-profile` renders the profile grid, gated by PIN entry
3. `lib/actions/profiles.ts:selectProfile` verifies the PIN via
   `verifyPin` (which calls the `record_pin_failure` Postgres RPC for
   atomic rate limiting — see migration 030), then sets the
   `active_profile_id` cookie
4. `proxy.ts` redirects to the role-based landing page

### 1.3. Cross-profile boundaries

**`primary_company_id` is the authoritative company assignment** for a
profile. `getUserWithCompany()` returns it as `companyId`. Server
actions use it as the WHERE-clause anchor for company scoping:

```ts
const { data } = await supabase
  .from('jobs')
  .select('*')
  .eq('company_id', companyId)  // ← THIS is the trust boundary
```

Under the shared-device model, the three Roofing company owners
(Econo, DeHart, Nushake) each have their own profile with their own
`primary_company_id`. When Mario selects his Econo profile, `companyId`
resolves to Econo's UUID and every subsequent query filters on it.
Switching profiles via the nav requires returning to `/select-profile`
and PIN-re-authenticating.

### 1.4. RLS is a defensive floor, not the trust boundary

Every table in the schema has RLS enabled. **Every policy uses
`auth.uid() IS NOT NULL` or a broken subquery against `public.users`**
— neither enforces the per-profile boundary. This is intentional:

- `auth.uid()` returns the SHARED Google account identity, the same for
  every profile under it. A policy that filters on `auth.uid() = user_id`
  would see all profiles as the same user.
- Most historical policies use
  `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = ...)`.
  This silently returns false (because `public.users.id` is generated
  by `crypto.randomUUID()` at profile creation time, never bridged to
  `auth.users.id`). Migration 036 added an `authed_floor` permissive
  policy that OR-combines with these dead-code policies so the broken
  ones become irrelevant without needing to drop them.

**What this means for new code:**

- **NEVER rely on RLS to enforce company scope.** Always add
  `.eq('company_id', companyId)` to every `.from('table')` query.
- **NEVER add client-side Supabase queries** (e.g., direct
  `supabase.from('jobs').select()` from a React component). Every
  read goes through a server action.
- If you ever add a realtime subscription or client-side query, stop
  and revisit the trust model — the `authed_floor` permissive policy
  will let the subscription see every profile's data.

### 1.5. PIN authentication

Profile selection requires a 4-digit PIN (migration 030). PINs are:
- Hashed with `SHA-256(pin + userId + PIN_HASH_SALT)` where
  `PIN_HASH_SALT` is a server-only env var (audit R3-#7 — fails
  closed if unset or < 16 chars)
- Rate-limited via `record_pin_failure` Postgres RPC that atomically
  increments failed attempts and locks the account for 15 minutes
  after 5 wrong tries
- Timing-safe compared via `crypto.timingSafeEqual`
- Reset via the companion `reset_pin_attempts` RPC on successful verify

The rate-limiting RPC was made atomic in round 2 to fix a TOCTOU race
where two concurrent failed attempts could both read attempts=4 and
both write attempts=5, losing one increment.

---

## 2. Money Model — "Integer Cents Everywhere"

All monetary values in RoofCRM are stored and manipulated as **integer
cents** (BIGINT in Postgres, `number` in TypeScript representing whole
cents). The only place floats exist is at the **UI input/display
boundary**, converted via `dollarsToCents` / `centsToDollars` helpers
in `lib/money.ts`.

### 2.1. Why cents

Float dollars are a constant correctness hazard:

- `0.1 + 0.2 !== 0.3` (IEEE 754 — famous)
- `Math.round(10000.005 * 100) === 1000000` not `1000001`
- Summing 200 line items of $37.89 introduces $0.03 drift by the end
- Half-splits (`total / 2`) on odd cents don't round-trip (`firstHalf + secondHalf !== total`)

The integer cents model sidesteps all of these: sums, multiplications,
rounding, and halving are all integer operations.

### 2.2. The migration history

| Migration | What it did |
|---|---|
| `027_cents_migration.sql` | Added `*_cents` columns alongside every legacy `*_amount` float column, backfilled existing rows, started dual-write period |
| `031_drop_legacy_money_columns.sql` | Dropped all legacy float columns (GENERATED `total` column on `invoice_line_items` included). Defensive backfill + drift gate in the preamble refuses to drop if any row has `legacy > 0 && cents = 0` |

All reader code reads `*_cents` directly. All writer code writes only
`*_cents`. The `readMoneyFromRow` transition helper was deleted in
Round 3 cleanup — see the tombstone comment at the bottom of
`lib/money.ts`.

### 2.3. The helpers

From `lib/money.ts`:

| Helper | Purpose |
|---|---|
| `dollarsToCents(n)` | UI dollar float → cents (round-half-up) |
| `centsToDollars(n)` | Cents → UI dollar float |
| `formatCents(n)` | Cents → `"$1,234.56"` display string |
| `formatCentsOrDash(n)` | Same, but `—` for zero |
| `sumCents([...])` | Integer sum of a cents array |
| `multiplyCents(cents, qty)` | `cents * qty` with integer rounding — use for line item totals |
| `applyPercentCents(cents, pct)` | `cents * (pct / 100)` with integer rounding — use for commissions, tax, tips |
| `halfCents(cents)` | First half of a 50/50 split (see §2.4 below) |

### 2.4. The half-cents rounding rule (audit R2-#9)

When splitting a total into two halves (e.g., "first payment 50%, second
payment 50%"), you CANNOT just compute `total / 2` twice. For odd-cent
totals like $10,000.01 (= 1,000,001 cents), `halfCents` rounds one half
DOWN and the caller computes the other half as `total - firstHalf`. The
two halves sum exactly to the total:

```ts
const totalCents = 1_000_001  // $10,000.01
const firstHalfCents = halfCents(totalCents)  // 500_000 ($5,000.00)
const secondHalfCents = totalCents - firstHalfCents  // 500_001 ($5,000.01)
// firstHalfCents + secondHalfCents === totalCents ✓
```

The previous bug was both halves rendering the same `deposit` variable,
making a $10,000.01 contract print $5,000.01 twice (summing to
$10,000.02, one cent over contract). Fix: `lib/pdf/agreement-template.tsx`.

### 2.5. Rules for new money code

1. **Never** `const x: number = 123.45` for money. Store `12345` and
   convert at the display boundary via `formatCents`.
2. **Never** `a + b` floats for money. Use `sumCents([a, b])` if both
   are cents, or convert one side first.
3. **Never** `a * 1.08` for tax/commission. Use `applyPercentCents(a, 108)`.
4. **Never** trust a DB row's field name — if it ends in `_amount` and
   is a float, you're reading a legacy column that should be gone. If
   you see one, it's a migration-031 leftover and needs deletion.
5. **Always** round exactly once, at the innermost integer operation.

---

## 3. Role Model — Four Roles, Three Gate Helpers

```
owner > office_manager > sales > crew
```

Roles live on `public.users.role` as an enum. The role enum was
simplified in a mid-project refactor from `{manager, sales, crew, sales_crew}`
to the current `{owner, office_manager, sales, crew}`. **Some old migrations
(like `025_subcontractors.sql`) still reference `role = 'manager'`** —
those policies silently evaluate false. They're dead code held in place
by the `authed_floor` defensive policy from migration 036. See §1.4.

### 3.1. The three gate helpers

From `lib/auth-helpers.ts`:

| Helper | Allows | Blocks | Used for |
|---|---|---|---|
| `requireManager(role)` | `owner`, `office_manager` | `sales`, `crew` | Admin actions: create users, unlock accounts, change roles, delete, manage pricebook, mark invoices paid |
| `requireJobEditor(role)` | `owner`, `office_manager` | `sales`, `crew` | Create/update jobs, change status via `updateJobStatus` |
| `requireEstimateEditor(role)` | `owner`, `office_manager`, `sales` | `crew` | Create/update estimates, invoices, line items |

**Crew** is read-only for most of the app. They can clock in/out,
upload photos, complete safety inspections, and read their own jobs,
but cannot edit job fields or create invoices.

### 3.2. Why three helpers instead of "role >= X"

Role comparison via an ordinal would look cleaner but couples the
semantic meaning (what are you allowed to DO?) to the label hierarchy
(who ranks above whom?). The three helpers let each action declare
its own requirement independently:

- `requireJobEditor` and `requireManager` happen to overlap today
  (both exclude sales + crew), but they're different semantic
  questions. If Mario ever adds a "senior sales" role that can
  edit jobs but not users, we change `requireJobEditor` in one
  place.
- `requireEstimateEditor` includes sales — a junior sales rep can
  build estimates but not mark invoices paid.

### 3.3. The owner-only escalation path

Within the manager tier, `owner` is special:

- Only owners can create other owner profiles (audit R2 — otherwise an
  office_manager could self-promote via the "add user" flow)
- Only owners can change a profile's `primary_company_id` to a
  different company, AND the target company must be one the owner
  actually owns via the `companies.owner_id` field (audit R2-#20)
- Only owners can modify owner profiles at all

`updateProfile` and `createProfile` in `lib/actions/profiles.ts` enforce
these rules with explicit `if (callerRole !== 'owner')` throws.

### 3.4. Rules for new role-gated code

1. **Always** call one of the three helpers at the top of any mutating
   server action. The pattern is:
   ```ts
   const { companyId, role } = await getUserWithCompany()
   requireManager(role)  // or requireJobEditor / requireEstimateEditor
   ```
2. **Never** check `role === 'manager'` — the old string doesn't
   match the enum. Use `requireManager` (which has the allowlist
   `['owner', 'office_manager']`).
3. **Never** trust a client-supplied role — server actions re-resolve
   role from the cookie on every call.
4. If the action is read-only, you probably don't need a role gate —
   just the `.eq('company_id', companyId)` company scope is enough.

---

## 4. Observability + Error Reporting

See `lib/observability.ts`. Every server action and route handler
failure goes through `reportError(err, context)` which:

1. Always emits a structured JSON log line to Vercel runtime logs
2. Optionally fires `ERROR_WEBHOOK_URL` (Slack / Discord / custom) —
   fire-and-forget, never blocks the request
3. Optionally forwards to Sentry via dynamic import if `SENTRY_DSN`
   is set and `@sentry/nextjs` is installed (the dynamic import means
   Sentry is NOT a hard dep — install it later to upgrade every
   `reportError` call site for free)

Vercel Analytics + Speed Insights are wired into `app/layout.tsx`
for Web Vitals. Neither requires env vars.

---

## 5. Migrations + Forward-Only Discipline

**Never modify a migration file that has been applied to any
environment.** This is the #1 rule. If you need to fix something in
an old migration, write a new migration that produces the desired
end-state idempotently. Every migration in this repo after audit
round 3 follows this pattern:

- Wrapped in `BEGIN; ... COMMIT;`
- Uses `IF NOT EXISTS` / `IF EXISTS` / `DO $$ ... END $$` guards so
  it's safe to re-run
- Documents the audit finding it's addressing in the preamble
- When dropping data, includes a drift gate (`RAISE EXCEPTION` if
  preconditions aren't met)

The migrations directory is ordered by numeric prefix (`001_` through
`038_`). Supabase's migration runner tracks which files have been
applied, so `supabase db push` only applies new ones.

### Key migrations

| Migration | Purpose |
|---|---|
| `001` | Initial schema |
| `027` | Float → cents migration (expand) |
| `030` | Portal token TTL + atomic PIN RPCs |
| `031` | Float → cents migration (contract) |
| `033` | Portal rate limiting (Postgres-backed) |
| `034` | Portal rate limit RPC GRANT (R4-#4) |
| `036` | RLS defensive floor (R4-#1) |
| `037` | Pricebook RLS + FK repoint (R4-#9, #10, #15) |
| `038` | FK indexes + seed idempotency (R4-#17, #18) |

---

## 6. Service Worker + PWA

`public/sw.js` has two responsibilities:

1. **Cache `/_next/static/*` hashed build output.** Stale-while-revalidate.
   Every other request (HTML, API, images, cross-origin) passes through
   to network untouched. This was narrowed in audit R2-#3 after a bug
   where `/_next/image?url=...` was caching Supabase signed URLs across
   shared-device users. **Do NOT widen this scope without thinking
   through cross-user cache leakage first.**

2. **Offline mutation queue.** Client can `postMessage({type: 'QUEUE_MUTATION', mutation})`
   and the SW stores it in IndexedDB under the `mutations` store. On
   `sync` event (browser fires when connectivity returns), the SW
   replays queued mutations one at a time. If any fail, the remaining
   stay queued for the next sync.

The `sync` and `message` handlers use explicit `event.waitUntil()` +
`awaitTx()` helpers to keep the SW alive across `await` points and
prevent IDB transaction auto-commit bugs. **Read the comments in
sw.js before touching the queue code** — there are three non-obvious
concurrency pitfalls documented inline.

CACHE_VERSION is bumped on every deploy that changes caching semantics
so the new SW installs cleanly and old caches are purged.

---

## Appendix — Where to look for common tasks

| Task | Start here |
|---|---|
| Add a new server action | `lib/actions/*.ts` — copy an existing one, keep the `getUserWithCompany` + role gate + company scope pattern |
| Add a new page | `app/(manager)/*`, `app/(sales)/*`, `app/(crew)/*` — pick the route group that matches the target role |
| Add a new role-gated action | `lib/auth-helpers.ts` has the three `require*` helpers |
| Touch money | `lib/money.ts` helpers are the only approved path |
| Add a new email template | `lib/actions/invoicing.ts` has the most complete examples — note the `sanitizeHeaderValue` / `sanitizeEmailName` / `escapeHtml` pattern for user-controlled strings |
| Add a new SMS template | `lib/actions/messages.ts` — wrap user-controlled fields in `sanitizeSmsField` |
| Add a new migration | Copy the shape of `034_portal_rate_limits_grant.sql`: BEGIN/COMMIT, IF NOT EXISTS guards, preamble explains the audit finding or intent |
| Add observability to a route handler | Import `reportError` + `logSpan` from `lib/observability` |
| Understand why a policy exists | Look for the audit-R#-# comment in the migration file — every non-obvious policy references its audit finding |
