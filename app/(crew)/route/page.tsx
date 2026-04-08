import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getUser, getUserRole } from '@/lib/auth'
import { getJobsByDate } from '@/lib/actions/jobs'
import { getActiveTimeEntry } from '@/lib/actions/time-tracking'
import { WeatherWidget } from '@/components/crew/weather-widget'
import { StatsBar } from '@/components/crew/stats-bar'
import { DayTimeline } from '@/components/crew/day-timeline'
import { SimpleMode } from '@/components/crew/simple-mode'
import { formatDisplayDate } from '@/lib/utils'
import type { Job, UserRole } from '@/lib/types/database'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}


export default async function RoutePage() {
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

  // Fetch display name from users table
  const supabase = await createClient()
  const { data: userData } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single()

  const displayName = userData?.name ?? user.email?.split('@')[0] ?? 'Crew'
  const firstName = displayName.split(' ')[0]

  // Today's date string
  const now = new Date()
  const todayString = now.toISOString().split('T')[0] // YYYY-MM-DD

  // Fetch today's jobs and active time entry in parallel
  const [jobs, activeTimeEntry] = await Promise.all([
    getJobsByDate(todayString, user.id, role ?? 'crew'),
    getActiveTimeEntry(user.id).catch(() => null),
  ])

  // Calculate stats
  const jobCount = jobs.length

  // Estimate times: no time info in data (only date), so show job count and "--" for times
  // unless we can infer from data. Jobs are ordered by scheduled_date ascending.
  // We can't derive specific times from date-only fields, so show counts.
  const firstStart: string | null = null
  const estimatedDone: string | null = null

  // Get city from first non-completed job for weather
  const activeJob = jobs.find((j) => j.status !== 'completed' && j.status !== 'cancelled')
  const weatherCity = activeJob?.city ?? jobs[0]?.city ?? 'Fresno'

  const hour = now.getHours()
  const greeting = getGreeting(hour)
  const displayDate = formatDisplayDate(now)

  // Simple mode check
  const cookieStore = await cookies()
  const isSimpleMode = cookieStore.get('crew_simple_mode')?.value === 'true'

  if (isSimpleMode) {
    return (
      <SimpleMode
        jobs={jobs as unknown as Parameters<typeof SimpleMode>[0]['jobs']}
        activeTimeEntry={activeTimeEntry}
        userId={user.id}
        firstName={firstName}
      />
    )
  }

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
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Top row: greeting + weather */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
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

          {/* Weather widget */}
          <WeatherWidget city={weatherCity} />
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar
        jobCount={jobCount}
        firstStart={firstStart}
        estimatedDone={estimatedDone}
      />

      {/* Day timeline */}
      <DayTimeline
        jobs={jobs as unknown as JobWithCompany[]}
        activeTimeEntry={activeTimeEntry}
        userId={user.id}
      />
    </div>
  )
}
