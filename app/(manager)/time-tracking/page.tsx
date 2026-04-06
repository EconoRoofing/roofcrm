import { getTimeEntries } from '@/lib/actions/time-tracking'
import LiveCrewStatus from '@/components/manager/live-crew-status'
import DailyTimeReport from '@/components/manager/daily-time-report'

export default async function TimeTrackingPage() {
  const today = new Date().toISOString().split('T')[0]

  // Fetch active entries (clocked in) and today's entries in parallel
  const [allEntries, todayEntries] = await Promise.all([
    getTimeEntries({}),
    getTimeEntries({ date: today }),
  ])

  // Filter to only active (no clock_out) for live status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeEntries = (allEntries as any[]).filter((e) => e.clock_out == null)

  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Page heading */}
      <h1
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '24px',
          fontWeight: 900,
          color: 'var(--text-primary)',
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        Time Tracking
      </h1>

      {/* Live crew status */}
      <LiveCrewStatus initialEntries={activeEntries} />

      {/* Daily time report */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <DailyTimeReport initialEntries={todayEntries as any[]} initialDate={today} />
    </div>
  )
}
