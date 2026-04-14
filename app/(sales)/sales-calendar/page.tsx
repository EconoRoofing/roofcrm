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

  // Sales sees the entire company calendar (read-only), not just their own jobs
  const jobs = await getJobs()

  // getJobs does not include rep relation, provide null for compatibility
  const jobsWithRelations = jobs.map((job) => ({
    ...job,
    company: (job as unknown as JobWithRelations).company ?? null,
    rep: null,
  })) as JobWithRelations[]

  return <CalendarView jobs={jobsWithRelations} />
}
