'use client'

import { useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { updateJobStatus } from '@/lib/actions/jobs'
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

export function KanbanBoard({ jobs: serverJobs, companies: _companies }: KanbanBoardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedCompanyId = searchParams.get('company')

  // Local state for optimistic updates
  const [localJobs, setLocalJobs] = useState<KanbanJob[]>(serverJobs)
  const [pendingMoves, setPendingMoves] = useState<Set<string>>(new Set())

  // Sync when server data changes
  if (serverJobs !== localJobs && pendingMoves.size === 0) {
    setLocalJobs(serverJobs)
  }

  // Client-side filter by company
  const filteredJobs = selectedCompanyId
    ? localJobs.filter((job) => job.company_id === selectedCompanyId)
    : localJobs

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

  // Optimistic move handler — updates UI instantly, syncs in background
  const handleMoveJob = useCallback(async (jobId: string, newStatus: JobStatus) => {
    // 1. Optimistic: move the card immediately in local state
    setLocalJobs(prev => prev.map(job =>
      job.id === jobId ? { ...job, status: newStatus } : job
    ))
    setPendingMoves(prev => new Set(prev).add(jobId))

    try {
      // 2. Server: persist the change
      await updateJobStatus(jobId, newStatus)
      // 3. Success: refresh server data in background
      router.refresh()
    } catch (err) {
      // 4. Rollback: snap card back to original position
      console.error('Failed to update job status:', err)
      setLocalJobs(serverJobs)
    } finally {
      setPendingMoves(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
    }
  }, [serverJobs, router])

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
            onMoveJob={handleMoveJob}
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
