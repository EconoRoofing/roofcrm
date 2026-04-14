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
