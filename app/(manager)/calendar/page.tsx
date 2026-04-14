import { getJobsForCalendar } from '@/lib/actions/jobs'
import { CalendarView } from '@/components/manager/calendar-view'

export default async function CalendarPage() {
  // Window the calendar query so we don't drop scheduled jobs off the bottom
  // of the row cap. Same 6-month window as /sales-calendar.
  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const toDate = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  const fromStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`
  const toStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`
  // Performance pass R5-#7: getJobsForCalendar uses a narrow select
  // (~9 fields) instead of getJobs (~25 fields). Cuts RSC payload by
  // ~70% on a 2000-row window. See lib/actions/jobs.ts:getJobsForCalendar.
  const jobs = await getJobsForCalendar(fromStr, toStr)

  return (
    <CalendarView
      jobs={jobs as unknown as Parameters<typeof CalendarView>[0]['jobs']}
    />
  )
}
