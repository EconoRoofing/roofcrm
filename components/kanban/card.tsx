'use client'

import { useRouter } from 'next/navigation'
import { CompanyTag } from '@/components/company-tag'
import type { getJobs } from '@/lib/actions/jobs'

export type KanbanJob = Awaited<ReturnType<typeof getJobs>>[number]

interface KanbanCardProps {
  job: KanbanJob
}

function getStaleBorderStyle(job: KanbanJob): React.CSSProperties {
  if (job.status !== 'lead' && job.status !== 'pending') {
    return { border: '1px solid var(--border-subtle)' }
  }

  const created = new Date(job.created_at)
  const now = new Date()
  const daysDiff = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))

  if (daysDiff >= 30) {
    return {
      borderTop: '1px solid var(--border-subtle)',
      borderRight: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
      borderLeft: '3px solid var(--accent-red)',
    }
  }
  if (daysDiff >= 14) {
    return {
      borderTop: '1px solid var(--border-subtle)',
      borderRight: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
      borderLeft: '3px solid var(--accent-amber)',
    }
  }

  return { border: '1px solid var(--border-subtle)' }
}

export function KanbanCard({ job }: KanbanCardProps) {
  const router = useRouter()
  const borderStyle = getStaleBorderStyle(job)
  const jobTypeLabel = job.job_type.replace(/_/g, ' ')

  const handleClick = () => {
    router.push(`/jobs/${job.id}`)
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('jobId', job.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      onClick={handleClick}
      style={{
        backgroundColor: 'var(--bg-card)',
        ...borderStyle,
        borderRadius: '20px',
        padding: '12px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transition: 'background-color 150ms ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-card)'
      }}
    >
      {/* Top row: job number + company tag */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
          }}
        >
          {job.job_number}
        </span>
        {job.company && (
          <CompanyTag name={job.company.name} color={job.company.color} />
        )}
      </div>

      {/* Customer name */}
      <span
        style={{
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: '1.3',
        }}
      >
        {job.customer_name}
      </span>

      {/* Job type */}
      <span
        style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          textTransform: 'capitalize',
        }}
      >
        {jobTypeLabel}
      </span>

      {/* Bottom row: rep name + amount */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontStyle: job.rep ? 'normal' : 'italic',
          }}
        >
          {job.rep ? job.rep.name : 'No rep'}
        </span>
        {job.total_amount != null && job.total_amount > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--accent)',
            }}
          >
            ${job.total_amount.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
