'use client'

import React, { useState } from 'react'
import { KanbanCard } from './card'
import type { KanbanJob } from './card'
import type { JobStatus } from '@/lib/types/database'

interface KanbanColumnProps {
  status: JobStatus
  jobs: KanbanJob[]
  label: string
  onMoveJob: (jobId: string, newStatus: JobStatus) => void
}

export const KanbanColumn = React.memo(function KanbanColumn({ status, jobs, label, onMoveJob }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)

    const jobId = e.dataTransfer.getData('jobId')
    if (!jobId) return

    // Optimistic — fires instantly, no await
    onMoveJob(jobId, status)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        minWidth: '220px',
        width: '220px',
        display: 'flex',
        flexDirection: 'column',
        border: isDragOver
          ? '1px solid var(--accent)'
          : '1px solid var(--border-subtle)',
        borderRadius: '20px',
        backgroundColor: isDragOver ? 'var(--accent-dim)' : 'var(--bg-surface)',
        transition: 'border-color 100ms ease, background-color 100ms ease',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Column header */}
      <div
        style={{
          padding: '12px 12px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--accent)',
            backgroundColor: 'var(--accent-dim)',
            padding: '2px 7px',
            borderRadius: '8px',
            lineHeight: '1.4',
          }}
        >
          {jobs.length}
        </span>
      </div>

      {/* Cards area — scrollable */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: '120px',
          maxHeight: 'calc(100vh - 220px)',
        }}
      >
        {jobs.map((job) => (
          <KanbanCard key={job.id} job={job} />
        ))}
        {jobs.length === 0 && (
          <div
            style={{
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '12px',
              border: '1px dashed var(--border-subtle)',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              Drop here
            </span>
          </div>
        )}
      </div>
    </div>
  )
})
