import { createClient } from '@/lib/supabase/server'
import { WarningIcon } from '@/components/icons'

interface JobCalendarWarningProps {
  jobId: string
}

/**
 * Server component — shows an amber warning banner when a job's
 * Google Calendar event has been deleted externally (calendar_deleted = true).
 */
export async function JobCalendarWarning({ jobId }: JobCalendarWarningProps) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, calendar_deleted, calendar_event_id')
    .eq('id', jobId)
    .single()

  // Only show if explicitly flagged as deleted
  if (!job?.calendar_deleted) return null

  return (
    <div
      style={{
        backgroundColor: 'rgba(255, 171, 0, 0.08)',
        border: '1px solid rgba(255, 171, 0, 0.3)',
        borderRadius: '8px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <WarningIcon />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: '600',
            color: '#ffab00',
          }}
        >
          Calendar event was deleted externally
        </span>
      </div>
      <form action={`/api/calendar/recreate`} method="POST">
        <input type="hidden" name="jobId" value={jobId} />
        <button
          type="submit"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#ffab00',
            backgroundColor: 'rgba(255, 171, 0, 0.12)',
            border: '1px solid rgba(255, 171, 0, 0.3)',
            borderRadius: '8px',
            padding: '6px 12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Recreate Event
        </button>
      </form>
    </div>
  )
}
