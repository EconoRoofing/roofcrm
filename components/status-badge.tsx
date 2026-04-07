import type { JobStatus } from '@/lib/types/database'

interface StatusBadgeProps {
  status: JobStatus
}

const STATUS_COLORS: Record<JobStatus, string> = {
  lead: '#448aff',
  estimate_scheduled: '#40c4ff',
  pending: '#ffab00',
  sold: '#00e676',
  scheduled: '#00e676',
  in_progress: '#ff9100',
  completed: '#6b7294',
  cancelled: '#ff5252',
}

const STATUS_LABELS: Record<JobStatus, string> = {
  lead: 'Lead',
  estimate_scheduled: 'Scheduled',
  pending: 'Pending',
  sold: 'Sold',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status]
  const bg = hexToRgba(color, 0.12)
  const label = STATUS_LABELS[status]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: '8px',
        backgroundColor: bg,
        color: color,
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        lineHeight: '1.4',
      }}
    >
      {label}
    </span>
  )
}
