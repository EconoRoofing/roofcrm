import { getJobs } from '@/lib/actions/jobs'
import { CalendarView } from '@/components/manager/calendar-view'

export default async function CalendarPage() {
  // Window the calendar query so we don't drop scheduled jobs off the bottom
  // of the row cap. Same 6-month window as /sales-calendar.
  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const toDate = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  const fromStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`
  const toStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`
  const jobs = await getJobs({ scheduled_from: fromStr, scheduled_to: toStr, limit: 2000 })

  return (
    <CalendarView
      jobs={jobs as unknown as Parameters<typeof CalendarView>[0]['jobs']}
    />
  )
}
