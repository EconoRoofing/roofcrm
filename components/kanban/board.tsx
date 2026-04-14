'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { updateJobStatus } from '@/lib/actions/jobs'
import { KanbanColumn } from './column'
import { formatCents, sumCents } from '@/lib/money'
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


export function KanbanBoard({ jobs: serverJobs, companies: _companies }: KanbanBoardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedCompanyId = searchParams.get('company')

  // Local state for optimistic updates
  const [localJobs, setLocalJobs] = useState<KanbanJob[]>(serverJobs)
  const [pendingMoves, setPendingMoves] = useState<Set<string>>(new Set())

  // Mirror serverJobs into a ref so handleMoveJob's rollback path can reach
  // the latest snapshot WITHOUT taking serverJobs as a useCallback dep.
  // Without this ref, every router.refresh() rebuilds handleMoveJob → new
  // KanbanColumn props → React.memo defeated → entire board re-renders.
  const serverJobsRef = useRef(serverJobs)
  useEffect(() => {
    serverJobsRef.current = serverJobs
  }, [serverJobs])

  // Sync when server data changes (moved to useEffect to avoid render-time setState)
  useEffect(() => {
    if (pendingMoves.size === 0) {
      setLocalJobs(serverJobs)
    }
  }, [serverJobs, pendingMoves.size])

  // Client-side filter by company
  const filteredJobs = useMemo(() => {
    return selectedCompanyId
      ? localJobs.filter((job) => job.company_id === selectedCompanyId)
      : localJobs
  }, [localJobs, selectedCompanyId])

  // Group by status (exclude cancelled)
  const grouped = useMemo(() => {
    const g = Object.fromEntries(
      COLUMN_ORDER.map((status) => [status, [] as KanbanJob[]])
    ) as Record<JobStatus, KanbanJob[]>

    for (const job of filteredJobs) {
      const s = job.status as JobStatus
      if (s !== 'cancelled' && g[s]) {
        g[s].push(job)
      }
    }

    // Sort each column by created_at ascending (oldest/most urgent first)
    for (const status of COLUMN_ORDER) {
      g[status].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }

    return g
  }, [filteredJobs])

  // ─── dnd-kit sensors ───────────────────────────────────────────────────────
  // Three sensors so the kanban works on every input modality:
  //   - PointerSensor: desktop mouse, requires 8px of movement before activating
  //     so a click without drag still navigates to the job page.
  //   - TouchSensor: iOS Safari + Android. 250ms press-delay so a quick tap
  //     navigates instead of starting a drag. Mario's iPhone runs this path.
  //   - KeyboardSensor: accessibility (space/enter to grab, arrows to move).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  )

  // Optimistic move handler — updates UI instantly, syncs in background.
  // Stable identity across server refreshes so React.memo on columns + cards
  // actually does its job. Reads the latest serverJobs via ref on rollback.
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
      // 4. Rollback: snap card back to the latest server snapshot via ref
      console.error('Failed to update job status:', err)
      setLocalJobs(serverJobsRef.current)
    } finally {
      setPendingMoves(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
    }
  }, [router])

  // dnd-kit drop handler. `active.id` is the dragged card (job id),
  // `over.id` is the column we landed on (status string). Skip if dropped
  // outside any column or onto the source column.
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const jobId = String(active.id)
    const newStatus = String(over.id) as JobStatus

    // Find the dragged job in current local state. If status didn't change,
    // skip the round trip entirely (dropping a card back onto its own column).
    const currentJob = localJobs.find((j) => j.id === jobId)
    if (!currentJob || currentJob.status === newStatus) return

    handleMoveJob(jobId, newStatus)
  }, [localJobs, handleMoveJob])

  // Revenue totals — sum in integer cents, format once at the boundary.
  // Audit R3-#2 follow-up: cents-only post-031.
  const { pendingRevenueCents, soldRevenueCents } = useMemo(() => {
    const cents = (j: KanbanJob): number => Number(j.total_amount_cents ?? 0)
    return {
      pendingRevenueCents: sumCents(
        filteredJobs.filter((j) => j.status === 'pending').map(cents)
      ),
      soldRevenueCents: sumCents(
        filteredJobs.filter((j) => j.status === 'sold').map(cents)
      ),
    }
  }, [filteredJobs])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* DndContext wraps the entire scrollable columns area. Touch & pointer
          sensors are configured above so the same code works on Mario's
          iPhone (where HTML5 drag never fired) and on desktop. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
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
      </DndContext>

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
              {formatCents(pendingRevenueCents)}
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
              {formatCents(soldRevenueCents)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
