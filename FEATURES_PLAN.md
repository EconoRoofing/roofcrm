# 4 Features Build Plan

## Feature 1: Customer Portal (PUBLIC - No Auth)
- [ ] Migrate DB: Add `portal_token` field to jobs table (if needed)
- [ ] Create `lib/actions/portal.ts` with:
  - `generatePortalToken(jobId)` - create 32-char hex token, save to jobs.portal_token
  - `getJobByPortalToken(token)` - fetch job + company join
- [ ] Create `app/portal/[token]/page.tsx` - PUBLIC page
  - Show: company name, job status progress bar (6 steps), scheduled date, contact button
  - Invalid token → "Project not found"
- [ ] Update `lib/actions/jobs.ts`:
  - `updateJobStatus()` - auto-generate portal token when status → sold (try/catch, best-effort)

## Feature 2: Crew Scheduler
- [ ] Create `lib/actions/scheduling.ts` with:
  - `getCrewAvailability(weekStart)` - crew list + assignments + unassigned jobs
  - `assignJobToCrew(jobId, crewId, date)` - update job
- [ ] Create `components/manager/crew-scheduler.tsx`
  - Weekly grid: rows=crew, columns=Mon-Sun
  - Click empty cell → assign job from unassigned list
- [ ] Create `app/(manager)/schedule/page.tsx` - wraps crew-scheduler component
- [ ] Update `app/(manager)/_components/manager-top-nav.tsx` - add "Schedule" link

## Feature 3: Photo Annotations + Before/After
- [ ] Create `components/photos/photo-annotator.tsx`
  - Canvas overlay on photo - draw circles/arrows/text
  - Save as JSON annotations
- [ ] Create `components/photos/before-after.tsx`
  - Side-by-side slider comparison of two photos
- [ ] Add both to job detail page

## Feature 4: Supplier Ordering
- [ ] Create `lib/actions/supplier.ts` with:
  - `emailSupplierOrder(jobId, supplierEmail)` - send formatted order via Resend
  - `generateSupplierOrderText(jobId)` - return formatted text
- [ ] Create `components/estimate/supplier-order.tsx`
  - Show material list items, supplier email input
  - "Send Order" and "Copy" buttons
- [ ] Update materials page - add "Send to Supplier" button

## Testing
- [ ] Portal: test valid/invalid token, check job data
- [ ] Scheduler: verify crew grid, job assignment
- [ ] Photos: test drawing, slider, JSON save
- [ ] Supplier: test email send, copy functionality

## Commit
- [ ] Single commit with all 4 features
