# Role cleanup + calendar access for crew/sales

## Goal

- Roles are: `owner`, `office_manager`, `sales`, `crew` (drop `manager` + `sales_crew` from UI)
- Crew + sales can VIEW the calendar but cannot edit jobs
- Crew + sales get a Calendar tab in their bottom navigation
- Only owners + office_managers can edit jobs / change schedules / write to Google Calendar

## Tasks (revised after exploring actual codebase)

### Discovered state
- Sales already has `/sales-calendar` (uses CalendarView) in their bottom nav as "Calendar"
- Crew already has `/week` (WeekStrip) in their bottom nav as "Week"
- Both pages are mostly read-only — `CalendarView` only allows tap-to-navigate, no editing
- Sales calendar currently filters by `rep_id: user.id` — only shows the salesperson's OWN jobs, not all company jobs. User wants to see "the calendar" so this should be expanded to ALL company jobs.
- Job detail page (`/jobs/[id]`) IS where editing happens — this is the real risk

### Tasks
- [x] Update `requireManager(role)` in `lib/auth-helpers.ts` — only `owner` + `office_manager`
- [x] Update `ROLE_LABELS` and `ROLE_COLORS` in `components/auth/profile-card.tsx`
- [x] Update `ROLE_ROUTES` in `components/auth/pin-entry.tsx`
- [x] Update role dropdown in `app/(manager)/team/page.tsx`
- [x] Update role dropdown in `app/select-profile/page.tsx`
- [x] Update `proxy.ts` role routing
- [x] Update `app/(sales)/sales-calendar/page.tsx` — show ALL company jobs
- [x] Make job detail read-only for crew (hide status advance + cancel)
  - `JobActions`: status/cancel buttons gated to `owner` + `office_manager`
  - `JobDetail.canManageEstimate`: owner/office_manager OR sales (sales can still create/edit estimates)
- [x] Sweep all `'manager'` / `'sales_crew'` references across `lib/actions/*`, `lib/types/database.ts`, `lib/hooks/use-user.ts`, `components/job-form.tsx`, `app/jobs/new`, `app/jobs/[id]/edit`, `app/page.tsx`
- [x] Delete orphaned `components/crew/role-toggle.tsx`
- [x] `npx next build` passes clean
- [ ] Commit + push

### NOT doing (already in place)
- ~~Move /calendar route~~ — keeping `/calendar` for owners/office_managers, sales has `/sales-calendar`, crew has `/week`
- ~~Add Calendar tab to crew bottom nav~~ — crew already has "Week" tab
- ~~Add Calendar tab to sales bottom nav~~ — sales already has "Calendar" tab

## Open Questions Resolved

- Q: Should `/schedule` (weekly crew assignment grid) also be visible to crew/sales? **A: User confirmed yes — they want crew/sales to view the calendar.** I'll interpret this conservatively as `/calendar` only for now, since `/schedule` is the drag-and-drop assignment editor and giving it to crew/sales could be confusing. If they want `/schedule` access too, we'll add it later.

## Audit items 28–41 + LOW items (current session)

### Mario must run this in Supabase SQL Editor
```sql
-- supabase/migrations/029_payroll_exclusion.sql
-- Adds excluded_from_payroll BOOLEAN to time_entries (default false).
```
Defensive, safe to re-run.

### Security hardening
- **#36 security headers** — `next.config.ts` now sets HSTS, X-Frame-Options (SAMEORIGIN, blocks portal clickjacking), X-Content-Type-Options, Referrer-Policy (strict-origin-when-cross-origin), Permissions-Policy (camera=self, mic=none, geolocation=self), legacy X-XSS-Protection. CSP deliberately deferred until the app's inline-style footprint is audited.
- **#35 portal rate limiting** — `sendPortalMessage` and `requestBooking` now run through a sliding-window limiter (5 requests per token per minute). Message/notes bodies capped at 2000/500 chars. `requestBooking` also validates date format to reject garbage. Limiter is module-level in-memory (per serverless instance × region) — plenty for current scale, move to Supabase-backed counter if it ever saturates.

### PIN entry hardening
- **#28 paste support** — window paste listener: if clipboard contains exactly 4 digits (after stripping non-digits), fill all four dots and auto-submit. Password managers and iPad Smart Keyboards now work.
- **#29 scoped keydown** — the global window keydown handler checks `document.activeElement` first. If focus is in an INPUT/TEXTAREA/SELECT/contentEditable, the handler is a no-op. Typing digits into other search boxes no longer advances the PIN.
- **#30 unmount cancellation** — new `mountedRef` gates every post-await setState in `handleSubmit`. Tapping Back during an in-flight `verifyPin` no longer warns about setState on unmounted or fires stray `router.push` calls.

### Cron cleanup
- **#37 dead cron routes deleted** — `/api/cron/digest`, `/api/cron/follow-ups`, `/api/cron/post-job` were thin wrappers around functions that `/api/cron/daily` already calls sequentially. Deleted (47 → 44 routes). `vercel.json` still wires only `daily`.

### Payroll exclusion (real #33 fix)
- Migration 029: `time_entries.excluded_from_payroll BOOLEAN DEFAULT false`
- New server action `excludeFromPayroll(entryId, excluded)` — manager-only, company-scoped
- Every payroll rollup now filters `excluded_from_payroll = false`:
  - `getJobLaborCost` + `getWeeklyHours` in time-tracking.ts
  - `getJobProfitability` + `getCompanyProfitSummary` in profitability.ts
  - Dashboard's 3 parallel time-entry queries
  - `reporting.ts` crew productivity report
  - `exportPayrollCSV` (export.ts) + `exportPayrollToCSV` (quickbooks-export.ts)
- `flagged` keeps its advisory semantics — "shift > 12 hours" and other auto-flags still count. Only manual exclusion removes from payroll.

### Scheduling + job-detail bug fixes
- **#32 `unassignJobFromCrew` data loss** — no longer nulls `scheduled_date` and `schedule_duration_days`. Unassign now means "open the slot," not "delete the schedule." Jobs stay on the calendar as unassigned after the crew leaves them.
- **#39 `getJob` error handling** — uses `maybeSingle()` + throws on real DB errors. Previously returned `null` on any error, which `notFound()` in the page handler silently rendered as "job not found" during DB outages.

### iOS robustness
- **#41 `video.play()` not caught** — `photo-capture.tsx` now awaits + catches. iOS Safari autoplay rejections show a real error message instead of leaving the viewfinder stuck on "Starting camera…".
- **#40 photos-grid unreachable branch** — `fetchProjectPhotos` now throws on HTTP errors (previously swallowed everything into `[]`). Component tracks `loading | error | ok` state so the "CompanyCam not connected" branch is actually reachable.
- **LOW broken thumbnail fallback** — raw `<img>` now has `onError` handler that swaps to a camera icon placeholder, keeping layout stable when a thumbnail 404s.

### LOW items
- **Calendar "today" captured at mount** — `todayKey` now derives from a fresh `new Date()` on each render. If the tab stays open across midnight, the today highlight moves.
- **`pathname.startsWith` null safety** — fixed in `crew-bottom-nav.tsx`, `sales-bottom-nav.tsx`, and 3 spots in `manager-top-nav.tsx`. `usePathname()` can return null during initial hydration.

### Verification
- `npx next build` clean across all 44 routes
- 3 dead cron routes removed (`digest`, `follow-ups`, `post-job`)

---

## Calendar webhook + iOS perf + iPhone kanban (previous session)

### Mario must run this in Supabase SQL Editor
```sql
-- supabase/migrations/028_calendar_webhook_hardening.sql
-- Adds three columns to users:
--   calendar_sync_token        — Google's incremental-sync cursor
--   calendar_watch_token       — shared secret to verify push notifications
--   calendar_watch_calendar_id — which per-company calendar this watch is for
```
Defensive migration, safe to re-run.

### Google Calendar webhook hardening (3 audit items)
- **Per-company calendar id** — webhook now queries the calendar id stored on the user record (`calendar_watch_calendar_id`), not always `'primary'`. Each company under econoroofing209@gmail.com can sync to its own calendar.
- **Channel-token verification** — webhook verifies `X-Goog-Channel-Token` against the secret we registered with the watch. Forged POSTs without the secret return 401 instead of overwriting `scheduled_date`.
- **Persistent syncToken** — webhook stores `nextSyncToken` from each `events.list` response and uses it on the next push for incremental sync. No more re-scanning a 1-hour window per notification. Handles Google's 410 Gone (expired sync token) by clearing and bootstrapping fresh.
- Bonus: `event.start.dateTime` now parsed via `localDateString()` so a 9pm-PST event doesn't land on tomorrow's UTC date.
- **NOTE for Mario**: this only takes effect for *future* watches. The next time you re-register a calendar watch (or run an admin "rotate watch" script if you have one), pass the new `token` and `calendarId` columns. Existing watches will continue to work but won't have the syncToken benefit until the user record is populated.

### iOS / mobile bugs
- **`100vh` → `100dvh`** in `column.tsx`, `job-list-table.tsx` (wizard.tsx, calendar-view.tsx already done in earlier session). Bottom nav and last cards no longer sit behind the iOS toolbar.
- **Signature pad rewrite** — `setCanvasSize` now:
  1. Skips if logical width didn't change (debounces iOS toolbar show/hide)
  2. Uses `devicePixelRatio` (capped at 3) for sharp lines on Retina/iPhone
  3. Snapshots existing strokes before resize and restores after
  4. Resize handler debounced to 150ms so spurious events don't fire mid-stroke
- **Kanban iPhone fix** — installed `@dnd-kit/core` and rewrote `card.tsx`/`column.tsx`/`board.tsx` to use `useDraggable`/`useDroppable`/`DndContext`. Three sensors:
  1. `PointerSensor` (8px distance constraint) for desktop mouse
  2. `TouchSensor` (250ms delay + 5px tolerance) for iPhone — quick taps still navigate
  3. `KeyboardSensor` for accessibility
  HTML5 drag-and-drop never fired on iOS Safari touch — Mario's primary device. The new code uses pointer events which work everywhere.

### Performance — Mario's lag complaints
- **Kanban re-render fix** — `handleMoveJob` no longer depends on `serverJobs`, so `router.refresh()` doesn't rebuild the callback. Latest `serverJobs` is read via a ref on rollback. `React.memo` on columns/cards now actually prevents re-renders.
- **Photos page request coalescing** — module-level cache with two layers:
  1. **In-flight dedup**: 10 components asking for the same projectId share ONE network call instead of 10
  2. **60-second result cache**: navigating away from /photos and coming back is instant (no fetch)
- **`useUser` hook caching** — module-level cache + listener pattern:
  1. First mount kicks off a single fetch; subsequent mounts await the same Promise
  2. Resolved entry served instantly to all listeners
  3. ONE `onAuthStateChange` subscription per tab (not per-component)
  4. Multi-component pages no longer multiply auth round-trips

### Verification
- `npx next build` clean across all 47 routes
- 1 new high-severity npm audit warning (transitive in dnd-kit deps) — not directly exploitable in this codebase, will track in cleanup session

---

## Float → Integer Cents migration (previous session)

### Strategy
Expand-and-contract: add `*_cents` BIGINT columns alongside legacy `*_amount` floats, backfill from existing values, deploy code that dual-writes both columns, then drop legacy columns in a follow-up after production soak.

### Mario must run this in Supabase SQL Editor BEFORE the deploy lands
```sql
-- supabase/migrations/027_cents_migration.sql
-- Adds cents columns to 9 tables, backfills from existing dollar columns,
-- and creates the unique partial index for time_entries one-open-per-user.
```
Open the file at `supabase/migrations/027_cents_migration.sql`, copy the contents into Supabase Dashboard → SQL Editor → New Query → Run.

### Code changes — all dual-write cents + legacy
- **New `lib/money.ts`** — single source of truth: `dollarsToCents`, `centsToDollars`, `formatCents`, `formatCentsCompact`, `formatCentsForPdf`, `parseUserInputToCents`, `applyPercentCents`, `multiplyCents`, `sumCents`, `splitCents`, `halfCents`, `readMoneyFromRow`. All money math now flows through these.
- **Types** — added `*_cents` fields alongside legacy `*_amount` on `Job`, `User`, `MaterialList`, `TimeEntry`, `OvertimeBreakdown`. Legacy fields marked `@deprecated`.
- **Server actions normalized to integer cents** for all writes and arithmetic, while preserving legacy dollar columns for backwards-compat:
  - `lib/actions/jobs.ts` — added `requireJobEditor` + `normalizeJobMoneyFields()` helper, `updateJob` dual-writes, `updateJobStatus` uses `applyPercentCents` for commission, `getSalesStats` sums in cents, `getJobs` pulls cents columns.
  - `lib/actions/invoicing.ts` — `createInvoice` normalizes to cents at the boundary, `markInvoicePaid` parses dollars→cents, `addLineItem`/`updateLineItem` compute `total_cents = multiplyCents(unit_price_cents, qty)` (replaces the dropped GENERATED column), all email templates use `formatCents` from cents columns.
  - `lib/actions/time-tracking.ts` — `clockIn` snapshots `hourly_rate_cents`/`day_rate_cents` from the user, `clockOut` does ALL payroll math in integer cents (regular + 1.5× OT + 2× DT + break premium), dual-writes `total_cost` + `total_cost_cents`. `getJobLaborCost` returns both.
  - `lib/actions/pricebook.ts` — line totals computed via `multiplyCents`, job total summed via `sumCents`, dual-writes pricebook + jobs.
  - `lib/actions/profitability.ts` — every rollup (`getJobProfitability`, `getCompanyProfitSummary`, `getRepCommissions`, `getCommissionDetail`) sums in cents.
  - `lib/actions/dashboard.ts` — pipeline value, monthly revenue, per-rep, per-company, per-type rollups, monthly labor cost — all cents.
  - `lib/actions/reporting.ts` — revenue report, crew productivity, job-type, source ROI — all cents.
  - `lib/actions/command-center.ts` — pipeline + monthly revenue summed in cents.
  - `lib/actions/quickbooks-export.ts` — invoice IIF, payroll CSV, expense CSV — all formatted via `formatCentsForPdf` from cents totals; payroll math uses `multiplyCents`.
  - `lib/actions/export.ts` — payroll CSV, jobs CSV, invoice IIF — same treatment.
  - `lib/actions/insurance.ts`, `lib/actions/subcontractors.ts`, `lib/actions/materials.ts`, `lib/actions/price-memory.ts` — all writes dual-write cents.
- **Forms / wizard** — `components/estimate/wizard.tsx`, `pricing-form.tsx`, `review-screen.tsx`: source from `*_cents` on init, sum + 50/50 split via `halfCents` so $10,001 → $5,000.50/$5,000.50 (exact), pass `*_cents` to `updateJob` at save. Also fixed `100vh → 100dvh` in wizard.
- **PDF templates** — `lib/pdf/invoice-template.tsx` computes subtotal/tax/total in cents, props accept both legacy + cents. `lib/pdf/agreement-template.tsx` uses `halfCents` for the deposit calc so `numberToWords` on the dollar value is exact.
- **Display sites** — `components/job-detail.tsx`: new `fmtMoney(centsCol, dollarCol)` helper, totals + 50/50 split + commission row all read cents.

### What's still on legacy (deferred to post-soak cleanup)
Most read-only display components (`kanban/card.tsx`, `kpi-cards.tsx`, `command-center.tsx`, `today-view.tsx`, `daily-time-report.tsx`, `job-cost-card.tsx`, `job-list-table.tsx`, `pipeline-list.tsx`, `digest.ts`, `app/portal/[token]/page.tsx`) still call `formatCurrency(jobOrInvoice.total_amount)` with legacy float dollars. They will continue to display the SAME values as before because:
1. Every write site dual-writes the legacy column from the cents column.
2. `formatCurrency()` accepts a `number` and produces a USD string — same shape, no breakage.

The follow-up cleanup session will swap these to `formatCents(*_cents)` and then drop the legacy columns via Migration 028.

### Verification
- `npx next build` passes clean — TypeScript types validated across all 47 routes.
- Build output unchanged; no new bundle warnings.

### What Mario verifies on production after deploy
1. **Run the migration first** (Supabase SQL Editor, `027_cents_migration.sql`).
2. Open an existing job — financials display the same dollar values as before.
3. Create a new estimate with line items that sum to an odd cent (e.g. $10,001.00) — confirm the 50/50 split shows $5,000.50 / $5,000.50, not $5,000.50 / $5,000.50 with a $0.01 mismatch.
4. Generate a new estimate PDF — dollar amounts on the agreement should match.
5. Mark a time entry complete (clock out) — verify `total_cost_cents` populated and matches `total_cost * 100`.
6. Run a payroll CSV export — totals should match the dashboard.

### Verification SQL (run after the migration)
```sql
-- Drift check: each row's cents column should equal ROUND(legacy * 100)
SELECT count(*) AS jobs_with_drift FROM jobs
  WHERE ABS(total_amount_cents - ROUND(COALESCE(total_amount, 0) * 100)::BIGINT) > 0;

SELECT count(*) AS invoices_with_drift FROM invoices
  WHERE ABS(total_amount_cents - ROUND(COALESCE(total_amount, 0) * 100)::BIGINT) > 0;

SELECT count(*) AS time_entries_with_drift FROM time_entries
  WHERE ABS(total_cost_cents - ROUND(COALESCE(total_cost, 0) * 100)::BIGINT) > 0;
```
All three queries should return `0`.

---

## Audit fix sweep — items 1–18 (previous session)

### Critical (security + data corruption)
- [x] **#1** Server-side role gates on `createJob` / `updateJob` / `updateJobStatus` / `deleteJob` via new `requireJobEditor()`. Crew is fully blocked; sales is blocked from job mutations (estimates only).
- [x] **#2** API route lockdown:
  - `POST /api/jobs/update-companycam` — adds `verifyJobOwnership`
  - `POST /api/jobs/[jobId]/estimate-pdf` — adds auth + `verifyJobOwnership` + `requireEstimateEditor`
  - `POST /api/jobs/[jobId]/invoice-pdf` — adds auth + `verifyJobOwnership` + `requireManager`
  - `GET /api/companycam/photos` — verifies projectId is linked to a job in caller's company
  - `GET /api/companycam/search` — requires editor + caller-owned address
  - `GET /api/weather` — now requires auth + cache size capped at 100 entries
- [x] **#3** `selectProfile` now hard-fails when the auth user owns no companies (closes the empty-companyIds bypass). `verifyPin` fails closed when `pin_hash` is null (no more PIN-less access).
- [x] **#4** Estimate PDF regeneration is blocked when the existing PDF URL is a signed contract (`-signed.pdf` filename convention). Signature flow uses 1-year signed URLs.
- [x] **#5** Service worker rewritten:
  - Bumped to `roofcrm-v3` cache name
  - **Never** caches `/api/*` responses (cross-user leak fix)
  - Never caches HTML navigations (auth-sensitive shells)
  - Stale-while-revalidate only for true static assets
  - New `CLEAR_CACHE` message handler — `select-profile` page posts it on mount and on sign-out
- [ ] **#6** **REQUIRES SUPABASE DASHBOARD ACTION FROM MARIO**: flip the `estimates` bucket to private (Storage → estimates → Settings → toggle off "Public bucket"). Code already issues signed URLs; once bucket is private the PDFs are no longer enumerable.

### High (business logic + data integrity)
- [x] **#7** `CalendarView` now renders multi-day jobs on every day they span (not just day 1). Fixed local-tz date parsing too. Also fixed `100vh` → `100dvh` for iOS toolbar.
- [x] **#8** `VALID_TRANSITIONS.completed` now allows `→ in_progress` (reopen for typo fix) and `→ cancelled` (warranty void). Reopening clears `completed_date`.
- [x] **#9** `updateJob` now rejects any attempt to write `status`, `completed_date`, `warranty_expiration`, or `calendar_event_id`. All status mutations must go through `updateJobStatus` so the side-effects pipeline runs.
- [x] **#10** `clockOut` no longer strands forgotten shifts. Shifts >24h are auto-closed at 12-hour cap, flagged "review required", and counted in payroll. Manager can correct via flag/unflag.
- [x] **#11** Race-condition guard on double clock-in: re-checks for OTHER open entries after insert, deletes the loser. Includes a TODO for Mario to add a `CREATE UNIQUE INDEX time_entries_one_open_per_user ON time_entries(user_id) WHERE clock_out IS NULL` migration.
- [x] **#12** `scheduling.ts` UTC-as-local date math replaced with `localDateString()` everywhere: `getCrewAvailability`, `assignJobToCrew`, `assignJobToCrewMultiDay`, `getCrewUnavailability`, `getDailyDispatchSummary`. Also fixed follow-up due date in `jobs.ts`.
- [x] **#13** `assignJobToCrew[MultiDay]` now verifies the crew member's `primary_company_id` matches the caller's company.
- [x] **#14** `updateJobStatus` adds optimistic-lock via `.eq('status', oldStatus)` — concurrent status changes by two managers will only fire side effects once. Uses `.maybeSingle()` and throws "changed by another user" if the row didn't match.
- [ ] **#15** **DEFERRED to a separate session.** Floating-point money → integer cents is a DB migration touching every existing job row plus every read/write site (estimates, invoices, payroll, commissions, reports). Too big for this sweep.
- [x] **#16** `createProfile` and `updateProfile` validate role against canonical list and require owner to mint/grant the `owner` role. Office managers can no longer self-elevate.
- [x] **#17** `generatePortalToken` now requires `requireEstimateEditor` (sales + managers, not crew). Crew can no longer rotate customer portal tokens.
- [x] **#18** `getJobs` now accepts `scheduled_from` / `scheduled_to` / `limit` filters. `/calendar` and `/sales-calendar` use a 6-month window so older scheduled jobs no longer fall off the bottom of the row cap.

### After Mario's Supabase action
1. **Flip `estimates` bucket to private** (Supabase Dashboard → Storage → estimates → toggle off Public). Until then, signed URLs still work but old `getPublicUrl()` PDF links from before this commit remain world-readable. After the flip, those public links 404 and only the freshly-generated signed URLs work.
2. **Optional but recommended**: add the unique partial index for `time_entries(user_id) WHERE clock_out IS NULL` for hard double-clock-in protection.

## Review

**What changed**
- Role model is now strictly `owner | office_manager | sales | crew` everywhere in code and UI. Legacy `manager` and `sales_crew` references were swept out of `lib/auth-helpers.ts`, `lib/actions/{jobs,profiles,scheduling,safety,time-tracking}.ts`, `lib/types/database.ts`, `lib/hooks/use-user.ts`, `components/{job-detail,job-actions,job-form}.tsx`, `components/auth/{profile-card,pin-entry}.tsx`, `app/(manager)/team/page.tsx`, `app/select-profile/page.tsx`, `app/page.tsx`, `app/jobs/new/page.tsx`, `app/jobs/[id]/edit/page.tsx`, `app/(crew)/more/page.tsx`, `app/(sales)/sales-more/page.tsx`, and `proxy.ts`.
- Sales calendar (`/sales-calendar`) now loads the full company calendar instead of filtering by `rep_id`.
- Crew sees the company schedule via the existing `/week` tab; sales sees it via the existing `/sales-calendar` tab. Both are read-only.
- Job detail page (`/jobs/[id]`) is now read-only for crew: the status-advance button and Cancel Job button only render for `owner` / `office_manager`. Sales can still create/edit estimates (no status changes). Quick links (Call/Text/Map) still render for everyone.
- The legacy DB enum still contains `manager` and `sales_crew` (Postgres can't drop enum values), but no code path references them anymore — they're effectively dead values.
- Orphaned `components/crew/role-toggle.tsx` was deleted (was sales_crew-only).

**Verification**
- `npx next build` compiled cleanly with TypeScript checks passing across all 47 routes.

**Not done (deliberate)**
- Did not touch `/schedule` (the drag-and-drop assignment grid). It stays owner/office_manager only — giving crew/sales access there would conflict with the read-only goal since `/schedule` IS the editor.
- Did not migrate the Postgres enum. Removing `manager` / `sales_crew` from `user_role` requires recreating the type, which is a separate migration if ever needed.
