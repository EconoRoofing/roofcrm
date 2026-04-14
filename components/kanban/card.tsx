'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { CompanyTag } from '@/components/company-tag'
import { formatCents, readMoneyFromRow } from '@/lib/money'

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
  total_amount_cents?: number | null
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

  // dnd-kit draggable. The sensors set up on the board enforce a press-delay
  // before activation, so a quick tap navigates instead of starting a drag.
  //
  // Audit R2-#33: the `data` object passed here was constructed inline on
  // every render. dnd-kit stashes it in a Map keyed by draggable id and
  // notifies subscribed contexts when its identity changes — meaning every
  // re-render of the pipeline (which happens on every status change, every
  // drag enter, etc.) was bumping every card's data identity, forcing
  // dnd-kit to re-broadcast and stealing a few milliseconds per render.
  // useMemo with [job.id, job.status] gives each card a stable data object
  // that only changes when the job actually moves columns.
  const draggableData = useMemo(
    () => ({ jobId: job.id, status: job.status }),
    [job.id, job.status]
  )
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: draggableData,
  })

  // Audit R3-#14: dnd-kit flips `isDragging` back to false BEFORE the
  // synthetic click event fires after a drag ends. So a 10px drag that
  // releases on the same column (no drop target change) used to navigate
  // the user away — they thought they were rearranging a card, the page
  // navigated to the job detail. Track the moment a drag ended in a ref
  // and suppress click for ~250ms after that moment.
  const lastDragEndRef = useRef<number>(0)
  const wasDraggingRef = useRef<boolean>(false)
  useEffect(() => {
    if (wasDraggingRef.current && !isDragging) {
      // Drag just ended — start the suppression window
      lastDragEndRef.current = Date.now()
    }
    wasDraggingRef.current = isDragging
  }, [isDragging])

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    // Drag just ended within the suppression window — don't navigate.
    if (Date.now() - lastDragEndRef.current < 250) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    router.push(`/jobs/${job.id}`)
  }

  // Total amount: prefer cents, fall back to legacy float dollars
  const totalCents = readMoneyFromRow(job.total_amount_cents, job.total_amount)
  const hasTotal = totalCents > 0

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      style={{
        backgroundColor: 'var(--bg-card)',
        ...borderStyle,
        borderRadius: '20px',
        padding: '12px',
        cursor: isDragging ? 'grabbing' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        // dnd-kit `transform` applies the drag offset
        transform: CSS.Translate.toString(transform),
        // While dragging, lift visually + drop shadow
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 'auto',
        transition: isDragging ? 'none' : 'all 0.15s ease',
        userSelect: 'none',
        // Disable iOS Safari's native touch behaviors that would interfere
        touchAction: 'none',
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
        {hasTotal && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--accent)',
            }}
          >
            {formatCents(totalCents)}
          </span>
        )}
      </div>
    </div>
  )
})
