import { getJobs } from '@/lib/actions/jobs'
import { CalendarView } from '@/components/manager/calendar-view'

export default async function CalendarPage() {
  const jobs = await getJobs()

  return (
    <CalendarView
      jobs={jobs as unknown as Parameters<typeof CalendarView>[0]['jobs']}
    />
  )
}
