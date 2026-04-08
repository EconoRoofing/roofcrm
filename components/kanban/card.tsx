'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { CompanyTag } from '@/components/company-tag'

// Minimal shape — only the fields the Kanban board actually renders.
// company/rep are typed as arrays to match Supabase's join inference;
// the card picks index [0] at render time (FK guarantees at most one row).
export interface KanbanJob {
  id: string
  job_number: string
  customer_name: string
  company_id: string
  status: string
  job_type: string
  total_amount: number | null
  created_at: string
  company: { id: string; name: string; color: string | null }[] | { id: string; name: string; color: string | null } | null
  rep: { id: string; name: string }[] | { id: string; name: string } | null
}

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

// Normalize Supabase join result — FK joins may come back as array or single object
function normalizeJoin<T>(v: T[] | T | null): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export const KanbanCard = React.memo(function KanbanCard({ job }: KanbanCardProps) {
  const router = useRouter()
  const borderStyle = getStaleBorderStyle(job)
  const jobTypeLabel = job.job_type.replace(/_/g, ' ')
  const company = normalizeJoin(job.company)
  const rep = normalizeJoin(job.rep)

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
        transition: 'all 0.15s ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-card)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = ''
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
        {company && (
          <CompanyTag name={company.name} color={company.color ?? '#888888'} />
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
            fontStyle: rep ? 'normal' : 'italic',
          }}
        >
          {rep ? rep.name : 'No rep'}
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
})
