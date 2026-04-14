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

## Audit fix sweep — items 1–18 (current session)

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
