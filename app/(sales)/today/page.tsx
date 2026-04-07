import { createClient } from '@/lib/supabase/server'
import { getUser, getUserRole } from '@/lib/auth'
import { getJobsByDate, getJobs } from '@/lib/actions/jobs'
import { getMyFollowUps } from '@/lib/actions/follow-up-tasks'
import { TodayView } from '@/components/sales/today-view'
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

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function daysSince(dateStr: string): number {
  const created = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
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

  // Fetch today's jobs, all user jobs, and due follow-ups in parallel
  const [todayJobs, allJobs, myFollowUps] = await Promise.all([
    getJobsByDate(todayString, user.id, role ?? 'sales'),
    getJobs({ rep_id: user.id }),
    getMyFollowUps(user.id),
  ])

  // Find stale jobs: pending or lead status, created more than 14 days ago
  const staleJobs = allJobs.filter((job) => {
    if (job.status !== 'pending' && job.status !== 'lead') return false
    return daysSince(job.created_at) >= 14
  })

  // Calculate stats
  const pendingCount = allJobs.filter((j) => j.status === 'pending').length

  // Monthly revenue from sold jobs this month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthlyRevenue = allJobs
    .filter((j) => j.status === 'sold' && j.created_at >= monthStart)
    .reduce((sum, j) => sum + (j.total_amount ?? 0), 0)

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
        staleJobs={staleJobs}
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
