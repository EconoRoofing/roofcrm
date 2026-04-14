import { getUser } from '@/lib/auth'
import { getJobs } from '@/lib/actions/jobs'
import { CalendarView } from '@/components/manager/calendar-view'
import type { Job } from '@/lib/types/database'

type JobWithRelations = Job & {
  company: { id: string; name: string; color: string } | null
  rep: { id: string; name: string } | null
}

export default async function SalesCalendarPage() {
  const user = await getUser()

  if (!user) {
    return (
      <div
        style={{
          padding: '48px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          Not signed in
        </span>
      </div>
    )
  }

  // Sales sees the entire company calendar (read-only), not just their own jobs.
  // Scope to a 6-month window centered on today so we don't hit the row cap.
  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const toDate = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  const fromStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`
  const toStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`
  const jobs = await getJobs({ scheduled_from: fromStr, scheduled_to: toStr, limit: 2000 })

  // getJobs returns a narrowed projection — cast through unknown for the calendar view
  const jobsWithRelations = jobs.map((job) => ({
    ...job,
    company: (job as unknown as JobWithRelations).company ?? null,
    rep: null,
  })) as unknown as JobWithRelations[]

  return <CalendarView jobs={jobsWithRelations} />
}
