'use client'

import { useSearchParams } from 'next/navigation'
import { KanbanColumn } from './column'
import type { KanbanJob } from './card'
import type { Company, JobStatus } from '@/lib/types/database'

interface KanbanBoardProps {
  jobs: KanbanJob[]
  companies: Company[]
}

const COLUMN_ORDER: JobStatus[] = [
  'lead',
  'estimate_scheduled',
  'pending',
  'sold',
  'scheduled',
  'in_progress',
  'completed',
]

const COLUMN_LABELS: Record<JobStatus, string> = {
  lead: 'Lead',
  estimate_scheduled: 'Estimate',
  pending: 'Pending',
  sold: 'Sold',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function formatCurrency(amount: number): string {
  return '$' + amount.toLocaleString('en-US')
}

export function KanbanBoard({ jobs, companies: _companies }: KanbanBoardProps) {
  const searchParams = useSearchParams()
  const selectedCompanyId = searchParams.get('company')

  // Client-side filter by company
  const filteredJobs = selectedCompanyId
    ? jobs.filter((job) => job.company_id === selectedCompanyId)
    : jobs

  // Group by status (exclude cancelled)
  const grouped = Object.fromEntries(
    COLUMN_ORDER.map((status) => [status, [] as KanbanJob[]])
  ) as Record<JobStatus, KanbanJob[]>

  for (const job of filteredJobs) {
    const s = job.status as JobStatus
    if (s !== 'cancelled' && grouped[s]) {
      grouped[s].push(job)
    }
  }

  // Revenue totals
  const pendingRevenue = filteredJobs
    .filter((j) => j.status === 'pending' && j.total_amount != null && j.total_amount > 0)
    .reduce((sum, j) => sum + (j.total_amount ?? 0), 0)

  const soldRevenue = filteredJobs
    .filter((j) => j.status === 'sold' && j.total_amount != null && j.total_amount > 0)
    .reduce((sum, j) => sum + (j.total_amount ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Scrollable columns area */}
      <div
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '16px 24px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start',
        }}
      >
        {COLUMN_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            jobs={grouped[status]}
            label={COLUMN_LABELS[status]}
          />
        ))}
      </div>

      {/* Revenue footer */}
      <div
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          backgroundColor: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Pipeline
        </span>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Pending:
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {formatCurrency(pendingRevenue)}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Sold:
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {formatCurrency(soldRevenue)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
