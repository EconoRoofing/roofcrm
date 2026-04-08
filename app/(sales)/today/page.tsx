import { createClient } from '@/lib/supabase/server'
import { getUser, getUserRole } from '@/lib/auth'
import { getJobsByDate, getSalesStats } from '@/lib/actions/jobs'
import { getMyFollowUps } from '@/lib/actions/follow-up-tasks'
import { TodayView } from '@/components/sales/today-view'
import { formatDisplayDate } from '@/lib/utils'
import type { UserRole, Job } from '@/lib/types/database'
import type { FollowUp } from '@/lib/actions/follow-up-tasks'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function TodayPage() {
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

  const role = (await getUserRole(user.id)) as UserRole | null

  // Fetch display name
  const supabase = await createClient()
  const { data: userData } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single()

  const displayName = userData?.name ?? user.email?.split('@')[0] ?? 'Sales'
  const firstName = displayName.split(' ')[0]

  const now = new Date()
  const todayString = now.toISOString().split('T')[0]

  // Fetch today's jobs, sales stats, and due follow-ups in parallel
  const [todayJobs, salesStats, myFollowUps] = await Promise.all([
    getJobsByDate(todayString, user.id, role ?? 'sales'),
    getSalesStats(user.id),
    getMyFollowUps(user.id),
  ])

  const { pendingCount, monthlyRevenue, staleJobs } = salesStats

  const hour = now.getHours()
  const greeting = getGreeting(hour)
  const displayDate = formatDisplayDate(now)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingTop: '16px',
        paddingBottom: '8px',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {greeting}, {firstName}
        </h1>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {displayDate}
        </span>
      </div>

      <TodayView
        todayJobs={todayJobs as JobWithCompany[]}
        staleJobs={staleJobs as unknown as Job[]}
        followUps={myFollowUps as FollowUp[]}
        currentUserId={user.id}
        stats={{
          appointments: todayJobs.length,
          pending: pendingCount,
          monthlyRevenue,
        }}
      />
    </div>
  )
}
