import { getJobsForCalendar } from '@/lib/actions/jobs'
import { getOverlayEvents } from '@/lib/actions/calendar-overlays'
import { CalendarView } from '@/components/manager/calendar-view'

export default async function CalendarPage() {
  // Window the calendar query so we don't drop scheduled jobs off the bottom
  // of the row cap. Same 6-month window as /sales-calendar.
  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const toDate = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  const fromStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`
  const toStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`

  // ISO timestamps for the overlay fetch — Google events.list expects RFC 3339.
  // Anchoring to local midnight avoids tz drift at month boundaries.
  const fromIso = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).toISOString()
  const toIso = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1).toISOString()

  // Performance pass R5-#7: getJobsForCalendar uses a narrow select
  // (~9 fields) instead of getJobs (~25 fields). Cuts RSC payload by
  // ~70% on a 2000-row window. See lib/actions/jobs.ts:getJobsForCalendar.
  //
  // Calendar 041+042: overlays are the Admin/Payroll and Days Off
  // calendars that aren't tied to `jobs` rows. We fetch them in parallel
  // with the job query so the two independent Google/Supabase fetches
  // don't serialize. `getOverlayEvents` returns [] on any failure, so
  // the calendar view degrades gracefully if Google Calendar is down.
  const [jobs, overlays] = await Promise.all([
    getJobsForCalendar(fromStr, toStr),
    getOverlayEvents(fromIso, toIso),
  ])

  return (
    <CalendarView
      jobs={jobs as unknown as Parameters<typeof CalendarView>[0]['jobs']}
      overlays={overlays}
    />
  )
}
